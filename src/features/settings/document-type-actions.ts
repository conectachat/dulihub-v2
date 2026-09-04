"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { falhou, gravou, type ActionState } from "@/lib/action-state";
import { traduzirErro } from "@/lib/erros";
import { resultado, resultadoSemContagem } from "@/lib/gravar";
import { createClient } from "@/lib/supabase/server";

/** @deprecated Use `ActionState` de `@/lib/action-state`. */
export type DocTypeState = ActionState;

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
  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  const rawParent = formData.get("parent_id");
  const parentId = typeof rawParent === "string" && rawParent ? rawParent : null;

  const orgId = await organizationId();
  if (!orgId) return falhou("Sua conta não está vinculada a nenhuma organização.");

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
    position: (siblings?.[0]?.position ?? -1) + 1,
  });

  if (error) return falhou(traduzirErro(error));

  revalidatePath(PATH);
  return gravou();
}

export async function renameDocumentType(
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (typeof id !== "string") return falhou("Pasta não informada.");
  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  const supabase = await createClient();
  const estado = resultado(
    await supabase
      .from("document_types")
      .update({ name: parsed.data })
      .eq("id", id)
      .select("id"),
  );
  if (estado.error) return estado;

  revalidatePath(PATH);
  return estado;
}

/** Troca de lugar com o irmão vizinho. Não muda de nível. */
export async function moveDocumentType(
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  const direction = formData.get("direction");
  if (typeof id !== "string" || (direction !== "up" && direction !== "down")) {
    return falhou("Movimento não informado.");
  }

  const supabase = await createClient();

  const { data: node, error: nodeError } = await supabase
    .from("document_types")
    .select("id, organization_id, parent_id, position")
    .eq("id", id)
    .maybeSingle();

  if (nodeError) return falhou(traduzirErro(nodeError));
  if (!node) return falhou("Pasta não encontrada.");

  let query = supabase
    .from("document_types")
    .select("id, position")
    .eq("organization_id", node.organization_id)
    .order("position", { ascending: direction === "down" })
    .limit(1);

  query = node.parent_id
    ? query.eq("parent_id", node.parent_id)
    : query.is("parent_id", null);

  const { data: neighbour, error: neighbourError } = await query[
    direction === "down" ? "gt" : "lt"
  ]("position", node.position).maybeSingle();

  if (neighbourError) return falhou(traduzirErro(neighbourError));
  // Já está na ponta. Não é erro, e a tela já desabilita o botão.
  if (!neighbour) return gravou();

  // Pela RPC da 0014: as duas gravações soltas que estavam aqui não tinham
  // transação nem posição sentinela, então falhar entre elas deixava dois
  // irmãos com a mesma posição — e a consulta de vizinho usa `gt`/`lt`
  // estrito, então a seta parava de encontrar quem estava empatado.
  const estado = resultadoSemContagem(
    await supabase.rpc("swap_positions", {
      p_tabela: "document_types",
      p_a: node.id,
      p_b: neighbour.id,
    }),
  );
  if (estado.error) return estado;

  revalidatePath(PATH);
  return estado;
}

/**
 * Apaga o nó e tudo abaixo dele.
 *
 * A chave estrangeira tem cascade, então os descendentes vão junto. A tela
 * avisa quantos antes de confirmar.
 */
export async function deleteDocumentType(
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Pasta não informada.");

  const supabase = await createClient();
  const estado = resultado(
    await supabase.from("document_types").delete().eq("id", id).select("id"),
  );
  if (estado.error) return estado;

  revalidatePath(PATH);
  return estado;
}
