"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { gravou, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";

export type { ActionState };

const opportunitySchema = z.object({
  person_id: z.string().uuid("Escolha um contato"),
  stage_id: z.string().uuid("Escolha uma etapa"),
  title: z.string().trim().min(1, "Informe um título"),
  value: z
    .string()
    .trim()
    .optional()
    .transform((v) => {
      if (!v) return null;
      // Aceita "12.500,00" e "12500.00": o usuário digita como fala.
      const normalized = v.replace(/\./g, "").replace(",", ".");
      const n = Number(normalized);
      return Number.isFinite(n) ? n : null;
    }),
  currency: z.enum(["BRL", "USD"]).default("BRL"),
  source: z.string().trim().optional(),
});

async function context() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .limit(1)
    .maybeSingle();

  return { supabase, userId: user?.id ?? null, organizationId: membership?.organization_id ?? null };
}

export async function createOpportunity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = opportunitySchema.safeParse({
    person_id: formData.get("person_id"),
    stage_id: formData.get("stage_id"),
    title: formData.get("title"),
    value: formData.get("value"),
    currency: formData.get("currency") ?? "BRL",
    source: formData.get("source"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase, userId, organizationId } = await context();
  if (!organizationId) return { error: "Sua conta não está vinculada a nenhuma organização." };

  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("pipeline_id, probability, is_won, is_lost")
    .eq("id", parsed.data.stage_id)
    .maybeSingle();

  if (!stage) return { error: "Etapa não encontrada." };

  const terminal = stage.is_won || stage.is_lost;

  const { error } = await supabase.from("opportunities").insert({
    organization_id: organizationId,
    person_id: parsed.data.person_id,
    pipeline_id: stage.pipeline_id,
    stage_id: parsed.data.stage_id,
    title: parsed.data.title,
    value: parsed.data.value,
    currency: parsed.data.currency,
    source: parsed.data.source || null,
    probability: stage.probability,
    // O banco exige coerência entre status e data de encerramento.
    status: stage.is_won ? "won" : stage.is_lost ? "lost" : "open",
    closed_at: terminal ? new Date().toISOString() : null,
    owner_id: userId,
    created_by: userId,
  });

  if (error) return { error: error.message };

  // Quem tem oportunidade deixa de ser simples contato. Cliente não regride.
  await supabase
    .from("people")
    .update({ lifecycle_stage: stage.is_won ? "client" : "opportunity" })
    .eq("id", parsed.data.person_id)
    .neq("lifecycle_stage", "client");

  revalidatePath("/crm");
  revalidatePath("/contatos");
  return gravou();
}

/**
 * Move a oportunidade para outra etapa.
 *
 * Etapa terminal define status e data de encerramento; voltar para o meio do
 * funil reabre. Assim a coluna onde o cartão está e o status nunca divergem.
 */
export async function moveOpportunity(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const stageId = formData.get("stage_id");
  if (typeof id !== "string" || typeof stageId !== "string") return;

  const { supabase, userId, organizationId } = await context();
  if (!organizationId) return;

  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("name, probability, is_won, is_lost")
    .eq("id", stageId)
    .maybeSingle();

  if (!stage) return;

  const terminal = stage.is_won || stage.is_lost;

  const { data: updated } = await supabase
    .from("opportunities")
    .update({
      stage_id: stageId,
      probability: stage.probability,
      status: stage.is_won ? "won" : stage.is_lost ? "lost" : "open",
      closed_at: terminal ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("person_id")
    .maybeSingle();

  if (updated?.person_id) {
    // Registra o movimento: o histórico da pessoa precisa mostrar por onde
    // a negociação passou, não só onde parou.
    await supabase.from("activities").insert({
      organization_id: organizationId,
      person_id: updated.person_id,
      opportunity_id: id,
      type: "stage_change",
      description: `Movida para ${stage.name}`,
      created_by: userId,
    });

    if (stage.is_won) {
      await supabase
        .from("people")
        .update({ lifecycle_stage: "client" })
        .eq("id", updated.person_id);
    }
  }

  revalidatePath("/crm");
  revalidatePath("/contatos");
}

export async function deleteOpportunity(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const { supabase } = await context();
  await supabase.from("opportunities").delete().eq("id", id);

  revalidatePath("/crm");
  revalidatePath("/contatos");
}
