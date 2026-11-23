"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { falhou, type ActionState } from "@/lib/action-state";
import { resultado, resultadoSemContagem } from "@/lib/gravar";
import { contextoAtual } from "@/lib/organizacao";
import { revalidarPessoa } from "@/lib/revalidar";

import {
  anotacaoDaCotacaoSchema,
  cotacaoSchema,
  formaSchema,
  observacaoSchema,
} from "./forma-schema";

/**
 * A forma de pagamento do negócio, na tela do lead (entrega 4a; FIC-7, FIC-10,
 * FIC-11).
 *
 * Salvar, confirmar, enviar e voltar para rascunho vão pelas funções da 0058 e da 0064, que conferem tudo de
 * novo e travam a forma: as frases delas voltam como estão. A forma inválida
 * nem sai daqui — a mesma primeira frase que a janela mostra. A cotação é a
 * única coluna gravada direto; a trava da 0058 deixa só ela e a anotação.
 */

const FORMATO = "A forma de pagamento veio num formato inválido.";

const uuid = z.string().uuid();

function primeiroErro(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? FORMATO;
}

function negocioDo(formData: FormData): string | null {
  const negocio = formData.get("negocio");
  return uuid.safeParse(negocio).success ? (negocio as string) : null;
}

/** O lead; com a pessoa, também o histórico no perfil dela. */
function revalidar(negocio: string, formData?: FormData) {
  revalidatePath(`/crm/${negocio}`);
  if (formData) {
    const pessoa = formData.get("pessoa");
    if (uuid.safeParse(pessoa).success) revalidarPessoa(pessoa as string);
  }
}

export async function salvarFormaDePagamento(
  _anterior: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const negocio = negocioDo(formData);
  if (!negocio) return falhou("Negócio não informado.");

  let bruto: unknown;
  try {
    bruto = JSON.parse(String(formData.get("forma") ?? ""));
  } catch {
    return falhou(FORMATO);
  }
  const forma = formaSchema.safeParse(bruto);
  if (!forma.success) return falhou(primeiroErro(forma.error));

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const estado = resultadoSemContagem(
    await supabase.rpc("salvar_forma_de_pagamento", { p_negocio: negocio, p_forma: forma.data }),
  );
  if (estado.error) return estado;

  revalidar(negocio);
  return estado;
}

export async function confirmarFormaPelaEquipe(
  _anterior: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const negocio = negocioDo(formData);
  if (!negocio) return falhou("Negócio não informado.");

  const observacao = observacaoSchema.safeParse(formData.get("observacao"));
  if (!observacao.success) return falhou(primeiroErro(observacao.error));

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const estado = resultadoSemContagem(
    await supabase.rpc("confirmar_forma_de_pagamento_pela_equipe", {
      p_negocio: negocio,
      // Vazia, o parâmetro não vai: o tipo gerado não aceita nulo, e o padrão
      // da função já é sem observação.
      ...(observacao.data ? { p_observacao: observacao.data } : {}),
    }),
  );
  if (estado.error) return estado;

  revalidar(negocio, formData);
  return estado;
}

const MUDOU = "A forma de pagamento mudou enquanto você olhava. Atualize a página.";

/** O lead, a pessoa, o quadro (o selo da ficha) e a Início (os avisos da forma). */
function revalidarLink(negocio: string, formData: FormData) {
  revalidar(negocio, formData);
  revalidatePath("/crm");
  revalidatePath("/");
}

/**
 * "Confirmar e gerar link" (entrega 4b, FIC-7): a forma vai no link da ficha.
 *
 * A `versao` é o `updated_at` que a prévia mostrou, em texto, como veio do
 * banco: `enviar_forma_de_pagamento` recusa se alguém salvou depois — o link
 * nunca sai com valores que ninguém viu.
 */
export async function enviarFormaDePagamento(
  _anterior: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const negocio = negocioDo(formData);
  if (!negocio) return falhou("Negócio não informado.");

  const versao = formData.get("versao");
  if (typeof versao !== "string" || !versao) return falhou(MUDOU);

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const estado = resultadoSemContagem(
    await supabase.rpc("enviar_forma_de_pagamento", {
      p_negocio: negocio,
      p_versao: versao,
      p_pedir_dados_de_novo: formData.get("pedir_dados_de_novo") === "on",
    }),
  );
  if (estado.error) return estado;

  revalidarLink(negocio, formData);
  return estado;
}

const DE = z.enum(["enviada", "recusada", "confirmada"]);

/**
 * Volta a forma para rascunho: Editar e Cancelar link (`de = enviada`),
 * Ajustar (`recusada`) e Refazer (`confirmada`, só o dono ou a gestão).
 *
 * Quem clica diz de que estado partiu: se o cliente respondeu no meio, o banco
 * recusa com "mudou enquanto você olhava" em vez de desfazer a resposta.
 */
export async function voltarFormaParaRascunho(
  _anterior: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const negocio = negocioDo(formData);
  if (!negocio) return falhou("Negócio não informado.");

  const de = DE.safeParse(formData.get("de"));
  if (!de.success) return falhou(FORMATO);

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const estado = resultadoSemContagem(
    await supabase.rpc("voltar_forma_para_rascunho", { p_negocio: negocio, p_de: de.data }),
  );
  if (estado.error) return estado;

  revalidarLink(negocio, formData);
  return estado;
}

/**
 * A cotação do C6 (FIC-11) ou a anotação dela, pelo `InlineText`: chega um
 * campo só, o que a pessoa editou.
 */
export async function salvarCotacao(formData: FormData): Promise<ActionState> {
  const plano = formData.get("plano");
  if (!uuid.safeParse(plano).success) return falhou("Forma de pagamento não informada.");
  const negocio = negocioDo(formData);
  if (!negocio) return falhou("Negócio não informado.");

  let campos: { reference_rate: number | null } | { reference_rate_note: string | null };
  if (formData.has("reference_rate")) {
    const cotacao = cotacaoSchema.safeParse(formData.get("reference_rate"));
    if (!cotacao.success) return falhou(primeiroErro(cotacao.error));
    campos = { reference_rate: cotacao.data };
  } else if (formData.has("reference_rate_note")) {
    const anotacao = anotacaoDaCotacaoSchema.safeParse(formData.get("reference_rate_note"));
    if (!anotacao.success) return falhou(primeiroErro(anotacao.error));
    campos = { reference_rate_note: anotacao.data };
  } else {
    return falhou("Informe a cotação ou a anotação.");
  }

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const estado = resultado(
    await supabase
      .from("payment_plans")
      .update(campos)
      .eq("id", plano as string)
      .select("id"),
  );
  if (estado.error) return estado;

  revalidar(negocio);
  return estado;
}
