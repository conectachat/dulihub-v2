"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type DocTypeState = { error: string | null; ok?: boolean };

const PATH = "/configuracoes/categorias-de-documento";

const nameSchema = z.string().trim().min(1, "Informe o nome").max(120);

async function organizationId() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .limit(1)
    .maybeSingle();
  return data?.organization_id ?? null;
}

/**
 * Cria um nó no catálogo.
 *
 * `parent_id` vazio cria na raiz; preenchido cria dentro do nó informado.
 * A posição é a última entre os irmãos — item novo entra no fim da lista,
 * onde a pessoa espera encontrá-lo.
 */
export async function createDocumentType(
  _prev: DocTypeState,
  formData: FormData,
): Promise<DocTypeState> {
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const rawParent = formData.get("parent_id");
  const parentId = typeof rawParent === "string" && rawParent ? rawParent : null;
  const isGroup = formData.get("is_group") === "on";

  const orgId = await organizationId();
  if (!orgId) return { error: "Sua conta não está vinculada a nenhuma organização." };

  const supabase = await createClient();

  let query = supabase
    .from("document_types")
    .select("position")
    .eq("organization_id", orgId)
    .order("position", { ascending: false })
    .limit(1);

  query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);

  const { data: siblings } = await query;

  const { error } = await supabase.from("document_types").insert({
    organization_id: orgId,
    parent_id: parentId,
    name: parsed.data,
    is_group: isGroup,
    position: (siblings?.[0]?.position ?? -1) + 1,
  });

  if (error) return { error: error.message };

  revalidatePath(PATH);
  return { error: null, ok: true };
}

export async function renameDocumentType(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (typeof id !== "string" || !parsed.success) return;

  const supabase = await createClient();
  await supabase.from("document_types").update({ name: parsed.data }).eq("id", id);

  revalidatePath(PATH);
}

/** Alterna entre pasta e documento. */
export async function toggleGroup(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const isGroup = formData.get("is_group") === "true";
  if (typeof id !== "string") return;

  const supabase = await createClient();

  // Nó com filhos não vira documento: os filhos ficariam pendurados em algo
  // que a tela trata como folha.
  if (isGroup) {
    const { count } = await supabase
      .from("document_types")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", id);
    if ((count ?? 0) > 0) return;
  }

  await supabase.from("document_types").update({ is_group: !isGroup }).eq("id", id);
  revalidatePath(PATH);
}

/** Troca de lugar com o irmão vizinho. Não muda de nível. */
export async function moveDocumentType(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const direction = formData.get("direction");
  if (typeof id !== "string" || (direction !== "up" && direction !== "down")) return;

  const supabase = await createClient();

  const { data: node } = await supabase
    .from("document_types")
    .select("id, organization_id, parent_id, position")
    .eq("id", id)
    .maybeSingle();

  if (!node) return;

  let query = supabase
    .from("document_types")
    .select("id, position")
    .eq("organization_id", node.organization_id)
    .order("position", { ascending: direction === "down" })
    .limit(1);

  query = node.parent_id
    ? query.eq("parent_id", node.parent_id)
    : query.is("parent_id", null);

  const { data: neighbour } = await query[direction === "down" ? "gt" : "lt"](
    "position",
    node.position,
  ).maybeSingle();

  if (!neighbour) return;

  await supabase
    .from("document_types")
    .update({ position: neighbour.position })
    .eq("id", node.id);
  await supabase
    .from("document_types")
    .update({ position: node.position })
    .eq("id", neighbour.id);

  revalidatePath(PATH);
}

/**
 * Apaga o nó e tudo abaixo dele.
 *
 * A chave estrangeira tem cascade, então os descendentes vão junto. A tela
 * avisa quantos antes de confirmar.
 */
export async function deleteDocumentType(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();
  await supabase.from("document_types").delete().eq("id", id);

  revalidatePath(PATH);
}
