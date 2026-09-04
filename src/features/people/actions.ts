"use server";

import { revalidatePath } from "next/cache";

import { gravou, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { personFromForm } from "./schema";

export type { ActionState };

/** Organização em que o usuário atual cria registros. */
async function currentOrganizationId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .limit(1)
    .maybeSingle();
  return data?.organization_id ?? null;
}

/**
 * Cria um contato.
 *
 * Nasce como `contact`. Ele vira `opportunity` quando ganha a primeira
 * oportunidade e `client` quando uma é ganha — sem cópia entre tabelas,
 * porque contato, lead e cliente são a mesma linha.
 */
export async function createPerson(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = personFromForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const organizationId = await currentOrganizationId();
  if (!organizationId) {
    return { error: "Sua conta não está vinculada a nenhuma organização." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("people").insert({
    ...parsed.data,
    organization_id: organizationId,
    lifecycle_stage: "contact",
    created_by: user?.id ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath("/contatos");
  return gravou();
}

export async function updatePerson(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Contato não informado." };

  const parsed = personFromForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("people").update(parsed.data).eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/contatos");
  return gravou();
}

/**
 * Exclusão reversível: marca `deleted_at` e some da lista de ativos.
 *
 * Contato tem histórico pendurado — notas, arquivos, oportunidades. Apagar de
 * verdade levaria tudo junto, e quase sempre a intenção é só tirar da vista.
 */
export async function softDeletePerson(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const supabase = await createClient();
  await supabase
    .from("people")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/contatos");
}

export async function restorePerson(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const supabase = await createClient();
  await supabase.from("people").update({ deleted_at: null }).eq("id", id);

  revalidatePath("/contatos");
}
