"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { falhou, gravou, type ActionState } from "@/lib/action-state";
import { traduzirErro } from "@/lib/erros";
import { resultado } from "@/lib/gravar";
import { createClient } from "@/lib/supabase/server";
import { PALETTE } from "@/lib/palette";

/** @deprecated Use `ActionState` de `@/lib/action-state`. */
export type TagActionState = ActionState;

const tagSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da tag").max(40),
  color: z
    .string()
    .trim()
    .refine((c) => (PALETTE as readonly string[]).includes(c), "Cor inválida"),
});

async function organizationId() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .limit(1)
    .maybeSingle();
  return data?.organization_id ?? null;
}

export async function createTag(
  _prev: TagActionState,
  formData: FormData,
): Promise<TagActionState> {
  const parsed = tagSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
  });
  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  const orgId = await organizationId();
  if (!orgId) return falhou("Sua conta não está vinculada a nenhuma organização.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("tags")
    .insert({ ...parsed.data, organization_id: orgId });

  if (error) return falhou(traduzirErro(error));

  revalidatePath("/configuracoes/tags");
  revalidatePath("/contatos");
  return gravou();
}

export async function updateTag(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Tag não informada.");

  const parsed = tagSchema.partial().safeParse({
    name: formData.get("name") ?? undefined,
    color: formData.get("color") ?? undefined,
  });
  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  const patch: Record<string, string> = {};
  if (parsed.data.name) patch.name = parsed.data.name;
  if (parsed.data.color) patch.color = parsed.data.color;
  // Nada a mudar não é falha; a tela só não precisa fazer nada.
  if (Object.keys(patch).length === 0) return gravou();

  const supabase = await createClient();
  const estado = resultado(
    await supabase.from("tags").update(patch).eq("id", id).select("id"),
  );
  if (estado.error) return estado;

  revalidatePath("/configuracoes/tags");
  revalidatePath("/contatos");
  return estado;
}

/**
 * Apaga a tag.
 *
 * `person_tags` tem cascade, então as associações somem junto. Os contatos
 * não são tocados — só perdem essa marcação. A tela avisa quantos serão
 * afetados antes de confirmar.
 */
export async function deleteTag(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Tag não informada.");

  const supabase = await createClient();
  const estado = resultado(
    await supabase.from("tags").delete().eq("id", id).select("id"),
  );
  if (estado.error) return estado;

  revalidatePath("/configuracoes/tags");
  revalidatePath("/contatos");
  return estado;
}
