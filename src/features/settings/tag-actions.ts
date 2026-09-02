"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { PALETTE } from "@/lib/palette";

export type TagActionState = { error: string | null; ok?: boolean };

const tagSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da tag").max(40),
  color: z
    .string()
    .trim()
    .refine((c) => (PALETTE as readonly string[]).includes(c), "Cor inválida"),
});

/** Traduz erro do banco para linguagem de quem está usando o app. */
function humanize(message: string) {
  if (message.includes("tags_org_name_unique")) {
    return "Já existe uma tag com esse nome.";
  }
  return message;
}

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
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const orgId = await organizationId();
  if (!orgId) return { error: "Sua conta não está vinculada a nenhuma organização." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tags")
    .insert({ ...parsed.data, organization_id: orgId });

  if (error) return { error: humanize(error.message) };

  revalidatePath("/configuracoes/tags");
  revalidatePath("/contatos");
  return { error: null, ok: true };
}

export async function updateTag(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const parsed = tagSchema.partial().safeParse({
    name: formData.get("name") ?? undefined,
    color: formData.get("color") ?? undefined,
  });
  if (!parsed.success) return;

  const patch: Record<string, string> = {};
  if (parsed.data.name) patch.name = parsed.data.name;
  if (parsed.data.color) patch.color = parsed.data.color;
  if (Object.keys(patch).length === 0) return;

  const supabase = await createClient();
  await supabase.from("tags").update(patch).eq("id", id);

  revalidatePath("/configuracoes/tags");
  revalidatePath("/contatos");
}

/**
 * Apaga a tag.
 *
 * `person_tags` tem cascade, então as associações somem junto. Os contatos
 * não são tocados — só perdem essa marcação. A tela avisa quantos serão
 * afetados antes de confirmar.
 */
export async function deleteTag(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();
  await supabase.from("tags").delete().eq("id", id);

  revalidatePath("/configuracoes/tags");
  revalidatePath("/contatos");
}
