"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type TimelineActionState = { error: string | null; ok?: boolean };

/** Tipos que o usuário pode lançar. `stage_change` é do sistema e não entra. */
const USER_TYPES = ["note", "call", "meeting", "email", "other"] as const;

const entrySchema = z.object({
  person_id: z.string().uuid(),
  type: z.enum(USER_TYPES),
  body: z.string().trim().min(1, "Escreva alguma coisa").max(5000),
  occurred_at: z.string().trim().optional(),
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
  return {
    supabase,
    userId: user?.id ?? null,
    organizationId: membership?.organization_id ?? null,
  };
}

/**
 * Registra uma entrada na linha do tempo.
 *
 * Um campo de escrita, dois destinos: `note` grava em `notes`, o resto em
 * `activities` com o tipo escolhido. Quem usa não precisa saber onde a coisa
 * mora — escreve e diz o que foi.
 */
export async function createEntry(
  _prev: TimelineActionState,
  formData: FormData,
): Promise<TimelineActionState> {
  const parsed = entrySchema.safeParse({
    person_id: formData.get("person_id"),
    type: formData.get("type"),
    body: formData.get("body"),
    occurred_at: formData.get("occurred_at"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase, userId, organizationId } = await context();
  if (!organizationId) {
    return { error: "Sua conta não está vinculada a nenhuma organização." };
  }

  const { person_id, type, body, occurred_at } = parsed.data;

  if (type === "note") {
    // Nota não aceita data retroativa: ela é do momento em que se escreve.
    const { error } = await supabase.from("notes").insert({
      organization_id: organizationId,
      person_id,
      body,
      created_by: userId,
    });
    if (error) return { error: error.message };
  } else {
    // Atividade aceita: ligação de ontem lançada hoje tem que cair no lugar
    // certo da linha do tempo, não no topo.
    const when = occurred_at ? new Date(occurred_at) : new Date();
    const { error } = await supabase.from("activities").insert({
      organization_id: organizationId,
      person_id,
      type,
      description: body,
      occurred_at: Number.isNaN(when.getTime())
        ? new Date().toISOString()
        : when.toISOString(),
      created_by: userId,
    });
    if (error) return { error: error.message };
  }

  revalidatePath(`/contatos/${person_id}`);
  return { error: null, ok: true };
}

/**
 * Apaga uma entrada.
 *
 * Só o autor, e nunca registro do sistema: o movimento no funil é histórico
 * automático. Se der para reescrever, deixa de servir como histórico.
 */
export async function deleteEntry(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const kind = formData.get("kind");
  const personId = formData.get("person_id");

  if (
    typeof id !== "string" ||
    typeof personId !== "string" ||
    (kind !== "note" && kind !== "activity")
  ) {
    return;
  }

  const { supabase, userId } = await context();
  if (!userId) return;

  if (kind === "note") {
    await supabase.from("notes").delete().eq("id", id).eq("created_by", userId);
  } else {
    await supabase
      .from("activities")
      .delete()
      .eq("id", id)
      .eq("created_by", userId)
      .neq("type", "stage_change");
  }

  revalidatePath(`/contatos/${personId}`);
}
