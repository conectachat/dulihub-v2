"use server";

import { revalidatePath } from "next/cache";

import { falhou, gravou, type ActionState } from "@/lib/action-state";
import { traduzirErro } from "@/lib/erros";
import { resultadoSemContagem } from "@/lib/gravar";
import { createClient } from "@/lib/supabase/server";

/**
 * Define o conjunto de tags de uma pessoa.
 *
 * Recebe a lista final e reconcilia: apaga o que saiu, insere o que entrou.
 * Substituir o conjunto inteiro em vez de tratar cada marcação isoladamente
 * evita estado intermediário incoerente — se a tela mandar três tags, a pessoa
 * termina com exatamente essas três.
 */
export async function setPersonTags(formData: FormData): Promise<ActionState> {
  const personId = formData.get("person_id");
  if (typeof personId !== "string" || !personId) {
    return falhou("Contato não informado.");
  }

  // Checkbox desmarcado não chega no FormData; a ausência é o sinal de remoção.
  const selected = new Set(
    formData.getAll("tag_ids").filter((v): v is string => typeof v === "string"),
  );

  const supabase = await createClient();

  const { data: existing, error } = await supabase
    .from("person_tags")
    .select("tag_id")
    .eq("person_id", personId);

  // Era o único lugar em toda a base que capturava um erro do Supabase dentro
  // de ação muda — e desistia sem avisar, sem nem revalidar a página.
  if (error) return falhou(traduzirErro(error));

  const current = new Set((existing ?? []).map((row) => row.tag_id));

  const toAdd = [...selected].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !selected.has(id));

  if (toRemove.length) {
    const estado = resultadoSemContagem(
      await supabase
        .from("person_tags")
        .delete()
        .eq("person_id", personId)
        .in("tag_id", toRemove),
    );
    if (estado.error) return estado;
  }

  if (toAdd.length) {
    const estado = resultadoSemContagem(
      await supabase
        .from("person_tags")
        .insert(toAdd.map((tag_id) => ({ person_id: personId, tag_id }))),
    );
    if (estado.error) return estado;
  }

  revalidatePath(`/contatos/${personId}`);
  revalidatePath("/contatos");
  return gravou();
}
