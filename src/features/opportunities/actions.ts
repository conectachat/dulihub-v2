"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { falhou, gravou, type ActionState } from "@/lib/action-state";
import { traduzirErro } from "@/lib/erros";
import { resultado, resultadoSemContagem } from "@/lib/gravar";
import { parseMoney } from "@/lib/numbers";
import { contextoAtual } from "@/lib/organizacao";

import {
  aplicarEtapa,
  COLUNAS_DA_ETAPA,
  etapaTerminal,
  type EtapaDeDestino,
} from "./mover";
import { motivoDaPerda } from "./regras";

const opportunitySchema = z.object({
  person_id: z.string().uuid("Escolha um contato"),
  stage_id: z.string().uuid("Escolha uma etapa"),
  title: z.string().trim().min(1, "Informe um título"),
  value: z.string().nullish().transform(parseMoney),
  currency: z.enum(["BRL", "USD"]).default("BRL"),
  source: z.string().trim().optional(),
});

export async function createOpportunity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = opportunitySchema.safeParse({
    person_id: formData.get("person_id"),
    stage_id: formData.get("stage_id"),
    title: formData.get("title"),
    value: formData.get("value"),
    currency: formData.get("currency") ?? "BRL",
    source: formData.get("source"),
  });

  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  const { supabase, userId, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  // A organização do negócio vem **da pessoa**, não da associação de quem
  // clicou. São coisas diferentes no dia em que existir parceiro, e usar a
  // associação carimbaria um contato de uma organização com o id de outra —
  // sem erro nenhum, porque a RLS aprova a linha resultante.
  const { data: pessoa, error: erroDaPessoa } = await supabase
    .from("people")
    .select("organization_id")
    .eq("id", parsed.data.person_id)
    .maybeSingle();

  if (erroDaPessoa) return falhou(traduzirErro(erroDaPessoa));
  if (!pessoa) return falhou("Contato não encontrado.");

  const { data: stage, error: stageError } = await supabase
    .from("pipeline_stages")
    .select("pipeline_id, probability, is_won, is_lost")
    .eq("id", parsed.data.stage_id)
    .maybeSingle();

  if (stageError) return falhou(traduzirErro(stageError));
  if (!stage) return falhou("Etapa não encontrada.");

  const terminal = stage.is_won || stage.is_lost;

  const { error } = await supabase.from("opportunities").insert({
    organization_id: pessoa.organization_id,
    person_id: parsed.data.person_id,
    pipeline_id: stage.pipeline_id,
    stage_id: parsed.data.stage_id,
    title: parsed.data.title,
    value: parsed.data.value,
    currency: parsed.data.currency,
    source: parsed.data.source || null,
    probability: stage.probability,
    // O banco exige coerência entre status e data de encerramento.
    status: stage.is_won ? "won" : stage.is_lost ? "lost" : "open",
    closed_at: terminal ? new Date().toISOString() : null,
    owner_id: userId,
    created_by: userId,
  });

  if (error) return falhou(traduzirErro(error));

  // Quem tem oportunidade deixa de ser simples contato. Cliente não regride.
  //
  // O `.neq` faz parte do filtro, então zero linhas aqui quer dizer "já era
  // cliente" — resultado certo, não falha. Por isso a checagem é do erro, e
  // não da contagem: `resultado()` leria o zero como recusa.
  const promocao = resultadoSemContagem(
    await supabase
      .from("people")
      .update({ lifecycle_stage: stage.is_won ? "client" : "opportunity" })
      .eq("id", parsed.data.person_id)
      .neq("lifecycle_stage", "client"),
  );
  if (promocao.error) return promocao;

  revalidatePath("/crm");
  revalidatePath("/contatos");
  return gravou();
}

/** Tudo o que mostra o negócio ou o estágio do contato. */
function revalidar(id: string, personId: string | null) {
  revalidatePath("/crm");
  revalidatePath(`/crm/${id}`);
  revalidatePath("/contatos");
  if (personId) revalidatePath(`/contatos/${personId}`);
  // A tela Início conta quem tem oportunidade e quem é cliente.
  revalidatePath("/");
}

/** Aplica a etapa (`mover.ts`) e revalida as telas — o que só o Next faz. */
async function mover(
  contexto: Pick<Awaited<ReturnType<typeof contextoAtual>>, "supabase" | "userId">,
  id: string,
  etapa: EtapaDeDestino,
  motivo: string | null,
): Promise<{ estado: ActionState; personId: string | null }> {
  const { error, personId } = await aplicarEtapa(
    contexto.supabase,
    contexto.userId,
    id,
    etapa,
    motivo,
  );
  if (error) return { estado: falhou(error), personId };

  revalidar(id, personId);
  return { estado: gravou(), personId };
}

/**
 * Move a oportunidade para outra etapa — o seletor do cartão, o arrastar e a
 * trilha da tela do lead.
 *
 * Para a etapa de perda exige o motivo (`motivo` e `detalhe` no formulário):
 * é o que impede o seletor ou o arrastar de pular a pergunta.
 */
export async function moveOpportunity(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const stageId = formData.get("stage_id");
  if (typeof id !== "string" || typeof stageId !== "string") {
    return falhou("Movimento não informado.");
  }

  const contexto = await contextoAtual();
  if (contexto.error) return falhou(contexto.error);

  const { data: etapa, error: erroEtapa } = await contexto.supabase
    .from("pipeline_stages")
    .select(COLUNAS_DA_ETAPA)
    .eq("id", stageId)
    .maybeSingle();

  if (erroEtapa) return falhou(traduzirErro(erroEtapa));
  if (!etapa) return falhou("Etapa não encontrada.");

  let motivo: string | null = null;
  if (etapa.is_lost) {
    const validado = motivoDaPerda(formData.get("motivo"), formData.get("detalhe"));
    if (!validado.ok) return falhou(validado.erro);
    motivo = validado.texto;
  }

  return (await mover(contexto, id, etapa, motivo)).estado;
}

/**
 * Ganho: o contrato foi assinado.
 *
 * O contato vira cliente — e cliente não volta a ser lead — e a tela segue
 * para o perfil completo dele, onde o processo nasce (decisão do Renato,
 * 3/out). Em caso de recusa não redireciona: devolve a frase.
 */
export async function ganharOportunidade(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return falhou("Negócio não informado.");

  const contexto = await contextoAtual();
  if (contexto.error) return falhou(contexto.error);

  const { etapa, error } = await etapaTerminal(contexto.supabase, id, "is_won");
  if (!etapa) return falhou(error!);

  const { estado, personId } = await mover(contexto, id, etapa, null);
  if (estado.error || !personId) return estado;

  // Fora de try/catch: `redirect` funciona lançando.
  redirect(`/contatos/${personId}`);
}

/** Perdido, com o motivo. O negócio continua no quadro, na coluna de perda. */
export async function perderOportunidade(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return falhou("Negócio não informado.");

  const validado = motivoDaPerda(formData.get("motivo"), formData.get("detalhe"));
  if (!validado.ok) return falhou(validado.erro);

  const contexto = await contextoAtual();
  if (contexto.error) return falhou(contexto.error);

  const { etapa, error } = await etapaTerminal(contexto.supabase, id, "is_lost");
  if (!etapa) return falhou(error!);

  return (await mover(contexto, id, etapa, validado.texto)).estado;
}

const edicaoSchema = z.object({
  id: z.string().uuid("Negócio não informado."),
  title: z.string().trim().min(1, "Informe um título"),
  value: z.string().nullish().transform(parseMoney),
  currency: z.enum(["BRL", "USD"]).default("BRL"),
  source: z.string().trim().optional(),
});

/** Título, valor, moeda e origem — o que se ajusta ao longo da negociação. */
export async function updateOpportunity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = edicaoSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title"),
    value: formData.get("value"),
    currency: formData.get("currency") ?? "BRL",
    source: formData.get("source"),
  });
  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { id, ...campos } = parsed.data;
  const { data, error } = await supabase
    .from("opportunities")
    .update({ ...campos, source: campos.source || null })
    .eq("id", id)
    .select("person_id");
  const estado = resultado({ data, error });
  if (estado.error) return estado;

  revalidar(id, data![0].person_id);
  return estado;
}

export async function deleteOpportunity(
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Oportunidade não informada.");

  const { supabase } = await contextoAtual();
  const estado = resultado(
    await supabase.from("opportunities").delete().eq("id", id).select("id"),
  );
  if (estado.error) return estado;

  revalidatePath("/crm");
  revalidatePath("/contatos");
  return estado;
}
