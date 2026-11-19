"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { falhou, gravou, type ActionState } from "@/lib/action-state";
import { aparar, erroDeContato, normalizarDdi } from "@/lib/contato";
import { traduzirErro } from "@/lib/erros";
import { resultado } from "@/lib/gravar";
import { novoId } from "@/lib/id";
import { contextoAtual } from "@/lib/organizacao";
import {
  CAMPO_CONFIRMAR_OPORTUNIDADE,
  CAMPO_CONFIRMAR_PARECIDO,
  respostaDaCriacao,
  type EstadoComConfirmacao,
} from "@/lib/parecidos";
import { enderecoDaPessoa } from "@/lib/pessoa";
import { revalidarPessoa } from "@/lib/revalidar";

import {
  aplicarEtapa,
  COLUNAS_DA_ETAPA,
  etapaTerminal,
  type EtapaDeDestino,
} from "./mover";
import { motivoDaPerda } from "./regras";
import { resumoDoGanhoSchema, type ResumoDoGanho } from "./schema";

const opportunitySchema = z.object({
  stage_id: z.string().uuid("Escolha uma etapa"),
  title: z.string().trim().min(1, "Informe um título"),
  source: z.string().trim().nullish(),
});

const texto = (valor: FormDataEntryValue | null) => (typeof valor === "string" ? valor : null);

/**
 * Cria o negócio com um contato existente **ou** com um contato novo, que
 * nasce junto (CRM-11, CRM-12), pela função `criar_oportunidade` (0041) —
 * uma transação só: nunca fica contato órfão de um negócio que falhou.
 *
 * A função confere tudo (etapa aberta, contato fora da lixeira, formato do
 * contato novo) e pode parar para perguntar: contato parecido (CON-4) ou
 * oportunidade anterior do contato. Aí a resposta vai sem `ok`, com a lista,
 * e a tela reenvia com a confirmação.
 *
 * A organização do negócio vem **da pessoa** (e a do contato novo, da
 * etapa), dentro da função — nunca da associação de quem clicou.
 */
export async function createOpportunity(
  _prev: EstadoComConfirmacao,
  formData: FormData,
): Promise<EstadoComConfirmacao> {
  const parsed = opportunitySchema.safeParse({
    stage_id: formData.get("stage_id"),
    title: formData.get("title"),
    source: formData.get("source"),
  });
  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  let contato: { p_contato: string } | { p_novo_contato: Record<string, string | null> };
  if (formData.get("modo_contato") === "novo") {
    const nome = aparar(texto(formData.get("novo_full_name")));
    if (!nome) return falhou("Informe o nome");

    const novo = {
      email: aparar(texto(formData.get("novo_email"))),
      ddi: aparar(texto(formData.get("novo_phone_country_code"))),
      telefone: aparar(texto(formData.get("novo_phone"))),
    };
    const erro = erroDeContato(novo);
    if (erro) return falhou(erro.mensagem);

    contato = {
      p_novo_contato: {
        full_name: nome,
        email: novo.email,
        phone_country_code: normalizarDdi(novo.ddi),
        phone: novo.telefone,
      },
    };
  } else {
    const id = texto(formData.get("person_id"));
    if (!id || !z.string().uuid().safeParse(id).success) return falhou("Escolha um contato");
    contato = { p_contato: id };
  }

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data, error } = await supabase.rpc("criar_oportunidade", {
    p_etapa: parsed.data.stage_id,
    p_titulo: parsed.data.title,
    p_confirmar_contato_parecido: formData.get(CAMPO_CONFIRMAR_PARECIDO) === "1",
    p_confirmar_outra_oportunidade: formData.get(CAMPO_CONFIRMAR_OPORTUNIDADE) === "1",
    ...contato,
    ...(parsed.data.source ? { p_origem: parsed.data.source } : {}),
    // Sem `p_valor` e `p_moeda`: o valor mora nos vistos do negócio (CRM-13),
    // e a 0054 tira os dois parâmetros da função.
  });
  if (error) return falhou(traduzirErro(error));

  const resposta = respostaDaCriacao.safeParse(data);
  if (!resposta.success) return falhou("O servidor respondeu num formato inesperado.");

  if (resposta.data.situacao === "precisa_confirmar") {
    return {
      error: null,
      parecidos: resposta.data.parecidos,
      oportunidades: resposta.data.oportunidades,
      token: novoId(),
    };
  }

  revalidatePath("/crm");
  revalidarPessoa();
  // A tela Início conta quem tem oportunidade.
  revalidatePath("/");
  return gravou();
}

/** Tudo o que mostra o negócio ou o estágio do contato. */
function revalidar(id: string, personId: string | null) {
  revalidatePath("/crm");
  revalidatePath(`/crm/${id}`);
  revalidarPessoa(personId);
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
 * O resumo do Ganho: `ganhar_negocio` com `p_simular`, que confere tudo e
 * devolve o que faria, sem gravar. É o mesmo formato da gravação — o resumo
 * e o resultado nunca divergem (spec §4.5). Recusa (sem visto, CRM-10…)
 * volta como a frase do banco, e a tela não oferece Confirmar.
 */
export async function resumoDoGanho(
  id: string,
): Promise<{ resumo: ResumoDoGanho | null; error: string | null }> {
  if (!z.string().uuid().safeParse(id).success) {
    return { resumo: null, error: "Negócio não informado." };
  }

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return { resumo: null, error: erroDoContexto };

  const { data, error } = await supabase.rpc("ganhar_negocio", {
    p_negocio: id,
    p_simular: true,
  });
  if (error) return { resumo: null, error: traduzirErro(error) };

  const lido = resumoDoGanhoSchema.safeParse(data);
  if (!lido.success) {
    return { resumo: null, error: "O servidor respondeu num formato inesperado." };
  }
  return { resumo: lido.data, error: null };
}

/**
 * Ganho: o contrato foi assinado.
 *
 * Numa transação, no banco (`ganhar_negocio`, 0052): negócio ganho,
 * histórico, cliente, dono, participantes e um processo por visto. A tela
 * segue para a aba Projetos do cliente, onde os processos acabaram de
 * nascer. Em caso de recusa não redireciona: devolve a frase.
 */
export async function ganharOportunidade(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return falhou("Negócio não informado.");

  const contexto = await contextoAtual();
  if (contexto.error) return falhou(contexto.error);

  const { data, error } = await contexto.supabase.rpc("ganhar_negocio", { p_negocio: id });
  if (error) return falhou(traduzirErro(error));

  const lido = resumoDoGanhoSchema.safeParse(data);
  if (!lido.success) return falhou("O servidor respondeu num formato inesperado.");

  revalidar(id, lido.data.pessoa.id);
  revalidatePath("/projetos");

  // Fora de try/catch: `redirect` funciona lançando.
  redirect(enderecoDaPessoa(lido.data.pessoa.id, "client", "projetos"));
}

/**
 * Reabre um negócio ganho na primeira etapa aberta (`reabrir_negocio`,
 * 0052). Só o dono do negócio ou a gestão; a pessoa continua cliente e os
 * processos continuam onde estão.
 */
export async function reabrirOportunidade(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return falhou("Negócio não informado.");

  const contexto = await contextoAtual();
  if (contexto.error) return falhou(contexto.error);

  const { error } = await contexto.supabase.rpc("reabrir_negocio", { p_negocio: id });
  if (error) return falhou(traduzirErro(error));

  revalidar(id, null);
  return gravou();
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
  source: z.string().trim().optional(),
});

/** Título e origem. O valor mora nos vistos do negócio (CRM-13). */
export async function updateOpportunity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = edicaoSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title"),
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
  revalidarPessoa();
  return estado;
}
