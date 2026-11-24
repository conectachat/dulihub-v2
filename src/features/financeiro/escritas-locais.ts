"use client";

import { falhou, gravou, type ActionState } from "@/lib/action-state";
import { novoId } from "@/lib/id";
import type { BancoLocal } from "@/lib/local/banco";
import { armazemDaFila, type BancoDaFila } from "@/lib/local/banco-da-fila";
import { lerTabela, pendentesDaFila } from "@/lib/local/leitura";
import { dependeDe, enfileirar, type ItemDaFila, type Operacao } from "@/lib/local/fila";
import { organizacaoLocal } from "@/lib/local/organizacao-local";
import { motivoDoPrazo, validadeDoEspelho } from "@/lib/local/sessao";
import {
  bancoDoUsuario,
  filaDoUsuario,
  sincronizarAgora,
  ultimaSincronia,
} from "@/lib/local/sincronizador";
import { usuarioLocal } from "@/lib/local/usuario";
import { formatarDia, hojeEmSaoPaulo } from "@/lib/formatar";

import { cobrancasDoContato } from "./consultas-locais";
import { gerarParcelas } from "@/lib/parcelas";
import type { Tables } from "@/lib/supabase/database.types";
import { baixaSchema, cobrancaSchema, vencimentoSchema } from "./schema";

/**
 * As gravações do a receber, feitas **no aparelho**.
 *
 * Mesmo caminho da Configuração: valida, grava na fila, pede a sincronia.
 * A tela não fica sabendo se há internet.
 *
 * A cobrança e as parcelas dela sobem **como um item só**, com vários passos.
 * Se o cabeçalho for recusado, as parcelas não sobem sozinhas — ficariam
 * penduradas numa cobrança que nunca existiu, e a fila as contaria como
 * aplicadas.
 */

const SEM_ESPELHO =
  "Este aparelho ainda não baixou seus dados. Conecte-se uma vez antes de gravar.";

const SEM_SESSAO = "Sua sessão terminou neste aparelho. Entre de novo.";

type Contexto = {
  userId: string;
  organizationId: string;
  banco: BancoLocal;
  fila: BancoDaFila;
};

async function contexto(): Promise<Contexto | { erro: string }> {
  const { userId } = await usuarioLocal();
  if (!userId) return { erro: SEM_SESSAO };

  const banco = bancoDoUsuario(userId);
  const fila = filaDoUsuario(userId);
  const organizationId = await organizacaoLocal(banco, userId);
  if (!organizationId) return { erro: SEM_ESPELHO };

  const validade = validadeDoEspelho(await ultimaSincronia(userId));
  if (!validade.podeGravar) return { erro: motivoDoPrazo(validade, "gravar") };

  return { userId, organizationId, banco, fila };
}

async function naFila(ctx: Contexto): Promise<ItemDaFila[]> {
  return armazemDaFila(ctx.fila).listar();
}

async function gravarLocal(
  ctx: Contexto,
  nova: { alvo: string; passos: Operacao[]; rotulo: string; depende?: string[] },
): Promise<ActionState> {
  try {
    await enfileirar(armazemDaFila(ctx.fila), nova);
  } catch (erro) {
    return falhou(
      `Não foi possível guardar a alteração neste aparelho. ${
        erro instanceof Error ? erro.message : ""
      }`.trim(),
    );
  }

  void sincronizarAgora(ctx.userId);
  return gravou();
}

export async function criarCobranca(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = cobrancaSchema.safeParse({
    person_id: formData.get("person_id"),
    title: formData.get("title"),
    amount: formData.get("amount"),
    list_amount: formData.get("list_amount"),
    currency: formData.get("currency") ?? "BRL",
    quantidade: formData.get("quantidade"),
    primeiro_vencimento: formData.get("primeiro_vencimento"),
    entrada: formData.get("entrada"),
    method: formData.get("method") ?? "pix",
    project_id: formData.get("project_id"),
  });
  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  const dados = parsed.data;
  const ctx = await contexto();
  if ("erro" in ctx) return falhou(ctx.erro);

  let parcelas;
  try {
    parcelas = gerarParcelas({
      total: dados.amount,
      quantidade: dados.quantidade,
      primeiroVencimento: dados.primeiro_vencimento,
      entrada: dados.entrada ?? undefined,
    });
  } catch (erro) {
    // A regra recusa entrada maior que o total e quantidade inválida. A
    // frase dela já está escrita para quem usa.
    return falhou(erro instanceof Error ? erro.message : "Parcelamento inválido.");
  }

  const id = novoId();
  const passos: Operacao[] = [
    {
      tipo: "insert",
      tabela: "receivables",
      linha: {
        id,
        organization_id: ctx.organizationId,
        person_id: dados.person_id,
        project_id: dados.project_id,
        title: dados.title,
        amount: dados.amount,
        list_amount: dados.list_amount,
        currency: dados.currency,
      },
    },
    ...parcelas.map((p) => ({
      tipo: "insert" as const,
      tabela: "installments",
      linha: {
        id: novoId(),
        organization_id: ctx.organizationId,
        receivable_id: id,
        number: p.number,
        amount: p.amount,
        due_on: p.due_on,
        method: dados.method,
      },
    })),
  ];

  return gravarLocal(ctx, {
    alvo: id,
    rotulo: `Criar a cobrança ${dados.title}`,
    passos,
  });
}

export async function renomearCobranca(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Cobrança não informada.");

  const title = formData.get("title");
  if (typeof title !== "string" || !title.trim()) {
    return falhou("Informe o nome da cobrança.");
  }

  const ctx = await contexto();
  if ("erro" in ctx) return falhou(ctx.erro);

  return gravarLocal(ctx, {
    alvo: id,
    depende: dependeDe(await naFila(ctx), id),
    rotulo: `Renomear a cobrança para ${title.trim()}`,
    passos: [{ tipo: "update", tabela: "receivables", id, patch: { title: title.trim() } }],
  });
}

/**
 * Exclui a cobrança; as parcelas vão em cascata no servidor.
 *
 * Um delete só, o da cobrança. Desde a 0048, apagar direto uma parcela com
 * anexo é recusado ("Remova os anexos antes."): com um delete por parcela, a
 * recusa da segunda deixaria a cobrança pela metade. Assim a recusa vem
 * inteira, como um conflito só.
 *
 * Na tela, as parcelas somem junto porque a leitura local descarta parcela
 * sem cobrança (`consultas-locais.ts`); a lápide de cada uma chega na
 * sincronia seguinte.
 */
export async function excluirCobranca(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const personId = formData.get("person_id");
  if (typeof id !== "string" || typeof personId !== "string") {
    return falhou("Cobrança não informada.");
  }

  const ctx = await contexto();
  if ("erro" in ctx) return falhou(ctx.erro);

  const cobranca = (
    await cobrancasDoContato(ctx.banco, ctx.fila, personId, hojeEmSaoPaulo())
  ).find((c) => c.id === id);
  if (!cobranca) return falhou("Cobrança não encontrada neste aparelho.");

  return gravarLocal(ctx, {
    alvo: id,
    depende: dependeDe(await naFila(ctx), id),
    rotulo: `Excluir a cobrança ${cobranca.title}`,
    passos: [{ tipo: "delete", tabela: "receivables", id }],
  });
}

/**
 * Dar baixa: o que entrou, quando, e por quanto estava o câmbio.
 *
 * A cotação fica **na parcela**, não no cabeçalho da cobrança. O que entrou
 * no caixa depende do dia em que entrou; guardar a cotação em cima faz o
 * histórico inteiro mudar quando o dólar muda — foi o que aconteceu no app
 * antigo.
 *
 * Em dólar a cotação é opcional (24/nov): sem ela, a parcela fica paga em
 * US$ e fora do recebido em reais — o dinheiro ficou em dólar e é convertido
 * depois, juntando vários.
 */
export async function darBaixa(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = baixaSchema.safeParse({
    id: formData.get("id"),
    paid_on: formData.get("paid_on"),
    paid_rate: formData.get("paid_rate"),
    moeda: formData.get("moeda"),
  });
  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  const { id, paid_on, paid_rate, moeda } = parsed.data;
  const ctx = await contexto();
  if ("erro" in ctx) return falhou(ctx.erro);

  return gravarLocal(ctx, {
    alvo: id,
    depende: dependeDe(await naFila(ctx), id),
    rotulo: `Dar baixa na parcela de ${formatarDia(paid_on)}`,
    passos: [
      {
        tipo: "update",
        tabela: "installments",
        id,
        // Em real a cotação é nula, e o banco recusa cotação sem pagamento.
        patch: { paid_on, paid_rate: moeda === "BRL" ? null : paid_rate },
      },
    ],
  });
}

/** Desfaz a baixa — a parcela volta a aparecer em aberto. */
export async function desfazerBaixa(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Parcela não informada.");

  const ctx = await contexto();
  if ("erro" in ctx) return falhou(ctx.erro);

  return gravarLocal(ctx, {
    alvo: id,
    depende: dependeDe(await naFila(ctx), id),
    rotulo: "Desfazer a baixa de uma parcela",
    passos: [
      {
        tipo: "update",
        tabela: "installments",
        id,
        // A cotação sai junto: ela só faz sentido com pagamento, e o banco
        // tem um check dizendo isso.
        patch: { paid_on: null, paid_rate: null },
      },
    ],
  });
}

/**
 * Mudar o vencimento de uma parcela em aberto (24/nov): o cliente combinou
 * pagar depois. A situação da parcela sai de `due_on` (não é guardada, 0033),
 * então ela deixa de aparecer atrasada no Financeiro e na Início.
 *
 * O histórico do cliente guarda a data de antes, no **mesmo** item da fila:
 * sobem juntos, e se o servidor recusar um, o item inteiro fica em conflito
 * com o motivo. A parcela, a cobrança e a data de antes vêm do aparelho (com
 * a fila por cima), para funcionar sem internet.
 */
export async function mudarVencimento(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = vencimentoSchema.safeParse({
    id: formData.get("id"),
    due_on: formData.get("due_on"),
  });
  if (!parsed.success) return falhou(parsed.error.issues[0].message);
  const { id, due_on } = parsed.data;

  const ctx = await contexto();
  if ("erro" in ctx) return falhou(ctx.erro);

  const itens = await pendentesDaFila(ctx.fila);
  const [parcelas, cobrancas] = await Promise.all([
    lerTabela(ctx.banco, "installments", itens),
    lerTabela(ctx.banco, "receivables", itens),
  ]);
  const parcela = (parcelas as Tables<"installments">[]).find((p) => p.id === id);
  const cobranca = parcela
    ? (cobrancas as Tables<"receivables">[]).find((c) => c.id === parcela.receivable_id)
    : undefined;
  if (!parcela || !cobranca) return falhou("Parcela não encontrada neste aparelho.");
  if (parcela.paid_on) return falhou("Parcela paga não muda de vencimento.");

  // A mesma data: nada a gravar, nada a contar no histórico.
  if (parcela.due_on === due_on) return gravou();

  return gravarLocal(ctx, {
    alvo: id,
    depende: dependeDe(await naFila(ctx), id),
    rotulo: `Mudar o vencimento da parcela ${parcela.number} para ${formatarDia(due_on)}`,
    passos: [
      { tipo: "update", tabela: "installments", id, patch: { due_on } },
      {
        tipo: "insert",
        tabela: "activities",
        linha: {
          id: novoId(),
          organization_id: parcela.organization_id,
          person_id: cobranca.person_id,
          type: "vencimento_alterado",
          description: `Vencimento da parcela ${parcela.number} de ${cobranca.title} mudado de ${formatarDia(parcela.due_on)} para ${formatarDia(due_on)}`,
          // A hora da mudança, não a da subida: offline, o banco carimbaria
          // o dia em que a fila sincronizou.
          occurred_at: new Date().toISOString(),
          created_by: ctx.userId,
        },
      },
    ],
  });
}
