"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { falhou, gravou, type ActionState } from "@/lib/action-state";
import { traduzirErro } from "@/lib/erros";
import { resultado } from "@/lib/gravar";
import { contextoAtual, SEM_ORGANIZACAO } from "@/lib/organizacao";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { PALETTE } from "@/lib/palette";

const tagSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da tag").max(40),
  color: z
    .string()
    .trim()
    .refine((c) => (PALETTE as readonly string[]).includes(c), "Cor inválida"),
});


export async function createTag(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = tagSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
  });
  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  const { supabase, organizationId: orgId, error: erroDoContexto } =
    await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);
  if (!orgId) return falhou(SEM_ORGANIZACAO);
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

  const patch: TablesUpdate<"tags"> = {};
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
