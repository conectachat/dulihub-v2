"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { gravou, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";

/** @deprecated Use `ActionState` de `@/lib/action-state`. */
export type StageActionState = ActionState;

const nameSchema = z.string().trim().min(1, "Informe o nome da etapa").max(60);

/**
 * Cria uma etapa antes das terminais.
 *
 * Ganho e perdido vivem nas posições 98 e 99 justamente para que qualquer
 * etapa nova caiba antes delas sem precisar reordenar o funil inteiro.
 */
export async function createStage(
  _prev: StageActionState,
  formData: FormData,
): Promise<StageActionState> {
  const parsedName = nameSchema.safeParse(formData.get("name"));
  if (!parsedName.success) return { error: parsedName.error.issues[0].message };

  const pipelineId = formData.get("pipeline_id");
  if (typeof pipelineId !== "string") return { error: "Funil não informado." };

  const supabase = await createClient();

  const { data: siblings } = await supabase
    .from("pipeline_stages")
    .select("position")
    .eq("pipeline_id", pipelineId)
    .eq("is_won", false)
    .eq("is_lost", false)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = (siblings?.[0]?.position ?? -1) + 1;
  if (nextPosition >= 98) {
    return { error: "Limite de etapas atingido. Junte ou remova alguma antes." };
  }

  const { error } = await supabase.from("pipeline_stages").insert({
    pipeline_id: pipelineId,
    name: parsedName.data,
    position: nextPosition,
  });

  if (error) return { error: error.message };

  revalidatePath("/configuracoes/etapas-do-funil");
  revalidatePath("/crm");
  return gravou();
}

export async function renameStage(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const parsedName = nameSchema.safeParse(formData.get("name"));
  if (typeof id !== "string" || !parsedName.success) return;

  const supabase = await createClient();
  await supabase
    .from("pipeline_stages")
    .update({ name: parsedName.data })
    .eq("id", id);

  revalidatePath("/configuracoes/etapas-do-funil");
  revalidatePath("/crm");
}

/**
 * Troca a etapa de lugar com a vizinha.
 *
 * Só entre etapas do meio: ganho e perdido ficam sempre no fim, porque o funil
 * termina neles.
 */
export async function moveStage(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const direction = formData.get("direction");
  if (typeof id !== "string" || (direction !== "up" && direction !== "down")) return;

  const supabase = await createClient();

  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("id, pipeline_id, position, is_won, is_lost")
    .eq("id", id)
    .maybeSingle();

  if (!stage || stage.is_won || stage.is_lost) return;

  const { data: neighbour } = await supabase
    .from("pipeline_stages")
    .select("id, position")
    .eq("pipeline_id", stage.pipeline_id)
    .eq("is_won", false)
    .eq("is_lost", false)
    .order("position", { ascending: direction === "down" })
    [direction === "down" ? "gt" : "lt"]("position", stage.position)
    .limit(1)
    .maybeSingle();

  if (!neighbour) return;

  // Posição intermediária evita colisão caso um índice único seja adicionado
  // depois. Duas trocas simples poderiam esbarrar uma na outra.
  await supabase.from("pipeline_stages").update({ position: -1 }).eq("id", stage.id);
  await supabase
    .from("pipeline_stages")
    .update({ position: stage.position })
    .eq("id", neighbour.id);
  await supabase
    .from("pipeline_stages")
    .update({ position: neighbour.position })
    .eq("id", stage.id);

  revalidatePath("/configuracoes/etapas-do-funil");
  revalidatePath("/crm");
}

/**
 * Remove uma etapa do meio.
 *
 * Terminal não passa daqui: o gatilho `pipeline_stages_protect_terminal` no
 * banco recusa, e a mensagem é traduzida para o usuário.
 */
export async function deleteStage(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();

  // Etapa com oportunidade dentro não some sem levar o negócio junto.
  const { count } = await supabase
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", id);

  if ((count ?? 0) > 0) return;

  await supabase.from("pipeline_stages").delete().eq("id", id);

  revalidatePath("/configuracoes/etapas-do-funil");
  revalidatePath("/crm");
}
