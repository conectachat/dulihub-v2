"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { falhou, gravou, type ActionState } from "@/lib/action-state";
import { traduzirErro } from "@/lib/erros";
import { contextoAtual } from "@/lib/organizacao";

/** Tipos que o usuário pode lançar. `stage_change` é do sistema e não entra. */
const USER_TYPES = ["note", "call", "meeting", "email", "other"] as const;

const entrySchema = z.object({
  person_id: z.string().uuid(),
  type: z.enum(USER_TYPES),
  body: z.string().trim().min(1, "Escreva alguma coisa").max(5000),
  occurred_at: z.string().trim().optional(),
});

/**
 * Registra uma entrada na linha do tempo.
 *
 * Um campo de escrita, dois destinos: `note` grava em `notes`, o resto em
 * `activities` com o tipo escolhido. Quem usa não precisa saber onde a coisa
 * mora — escreve e diz o que foi.
 */
export async function createEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = entrySchema.safeParse({
    person_id: formData.get("person_id"),
    type: formData.get("type"),
    body: formData.get("body"),
    occurred_at: formData.get("occurred_at"),
  });

  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  const { supabase, userId, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { person_id, type, body, occurred_at } = parsed.data;

  // A organização do registro é a da pessoa, não a de quem escreve. Um
  // consultor da Duli atendendo cliente alocado por um parceiro escreve
  // dentro da organização do parceiro, que é onde a nota tem de ficar.
  const { data: pessoa, error: erroDaPessoa } = await supabase
    .from("people")
    .select("organization_id")
    .eq("id", person_id)
    .maybeSingle();

  if (erroDaPessoa) return falhou(traduzirErro(erroDaPessoa));
  if (!pessoa) return falhou("Contato não encontrado.");
  const organizationId = pessoa.organization_id;

  if (type === "note") {
    // Nota não aceita data retroativa: ela é do momento em que se escreve.
    const { error } = await supabase.from("notes").insert({
      organization_id: organizationId,
      person_id,
      body,
      created_by: userId,
    });
    if (error) return falhou(traduzirErro(error));
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
    if (error) return falhou(traduzirErro(error));
  }

  revalidatePath(`/contatos/${person_id}`);
  return gravou();
}

/**
 * Apaga uma entrada.
 *
 * Só o autor, e nunca registro do sistema: o movimento no funil é histórico
 * automático. Se der para reescrever, deixa de servir como histórico.
 */
export async function deleteEntry(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const kind = formData.get("kind");
  const personId = formData.get("person_id");

  if (
    typeof id !== "string" ||
    typeof personId !== "string" ||
    (kind !== "note" && kind !== "activity")
  ) {
    return falhou("Entrada não informada.");
  }

  const { supabase, userId } = await contextoAtual();
  if (!userId) return falhou("Sua sessão expirou. Entre de novo.");

  // As condições de autoria e de tipo fazem parte do filtro, então zero linhas
  // aqui quer dizer "não é seu, ou é registro automático do sistema" — e essa
  // recusa passa a ter voz, em vez de o botão simplesmente não fazer nada.
  const resposta =
    kind === "note"
      ? await supabase
          .from("notes")
          .delete()
          .eq("id", id)
          .eq("created_by", userId)
          .select("id")
      : await supabase
          .from("activities")
          .delete()
          .eq("id", id)
          .eq("created_by", userId)
          .neq("type", "stage_change")
          .select("id");

  if (resposta.error) return falhou(traduzirErro(resposta.error));
  if (!resposta.data || resposta.data.length === 0) {
    return falhou(
      "Só quem escreveu pode apagar, e movimento de funil é histórico do sistema.",
    );
  }

  revalidatePath(`/contatos/${personId}`);
  return gravou();
}
