"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Define o conjunto de tags de uma pessoa.
 *
 * Recebe a lista final e reconcilia: apaga o que saiu, insere o que entrou.
 * Substituir o conjunto inteiro em vez de tratar cada marcação isoladamente
 * evita estado intermediário incoerente — se a tela mandar três tags, a pessoa
 * termina com exatamente essas três.
 */
export async function setPersonTags(formData: FormData): Promise<void> {
  const personId = formData.get("person_id");
  if (typeof personId !== "string" || !personId) return;

  // Checkbox desmarcado não chega no FormData; a ausência é o sinal de remoção.
  const selected = new Set(
    formData.getAll("tag_ids").filter((v): v is string => typeof v === "string"),
  );

  const supabase = await createClient();

  const { data: existing, error } = await supabase
    .from("person_tags")
    .select("tag_id")
    .eq("person_id", personId);

  if (error) return;

  const current = new Set((existing ?? []).map((row) => row.tag_id));

  const toAdd = [...selected].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !selected.has(id));

  if (toRemove.length) {
    await supabase
      .from("person_tags")
      .delete()
      .eq("person_id", personId)
      .in("tag_id", toRemove);
  }

  if (toAdd.length) {
    await supabase
      .from("person_tags")
      .insert(toAdd.map((tag_id) => ({ person_id: personId, tag_id })));
  }

  revalidatePath(`/contatos/${personId}`);
  revalidatePath("/contatos");
}
