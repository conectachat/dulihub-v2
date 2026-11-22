import { formatarDia } from "@/lib/formatar";
import { gerarParcelas, ROTULO_DO_METODO, type Metodo, type ParcelaNova } from "@/lib/parcelas";
import { emCentavos, emMoeda, formatarMoeda, type PorMoeda } from "@/lib/totals";

import type { ResumoDoGanho } from "./schema";

/**
 * A forma de pagamento do negócio (entrega 4a) — regras puras, testadas em
 * `forma-regras.test.ts`.
 *
 * Cada parte tem o seu valor **na sua moeda** (entrada de R$ 10.000 no pix e
 * 3 × US$ 3.000 por transferência): o total aparece por moeda e nunca se
 * converte. A tela confere aqui o que o banco confere de novo em
 * `salvar_forma_de_pagamento`, na mesma ordem, e mostra a primeira falha de
 * cada parte — uma frase só, porque um erro puxa outros (a parcela que falta
 * também faz a soma falhar).
 */

export type Moeda = "BRL" | "USD";

export type ParteDaForma = {
  label: string;
  method: Metodo;
  currency: Moeda;
  total: number;
  installments_count: number;
  parcelas: ParcelaNova[];
};

export type TipoDeParte = "entrada" | "parcelas" | "cartao" | "a_vista";

export const LIMITES = { partes: 10, rotulo: 80, observacao: 500, parcelas: 36 } as const;

/** O maior valor que `numeric(12,2)` guarda. */
const VALOR_MAXIMO = 9_999_999_999.99;

/** Os padrões de cada botão (P10 do plano). A pessoa muda tudo depois. */
const SUGESTOES: Record<TipoDeParte, { label: string; method: Metodo; installments_count: number }> = {
  entrada: { label: "Entrada", method: "pix", installments_count: 1 },
  parcelas: { label: "Parcelas", method: "transferencia", installments_count: 3 },
  cartao: { label: "Cartão", method: "cartao", installments_count: 1 },
  a_vista: { label: "À vista", method: "pix", installments_count: 1 },
};

/** A moeda dos vistos, quando são todos da mesma; senão, real. */
export function moedaSugerida(itens: { currency: string }[]): Moeda {
  const moedas = new Set(itens.map((i) => i.currency));
  if (moedas.size === 1) {
    const [unica] = moedas;
    if (unica === "BRL" || unica === "USD") return unica;
  }
  return "BRL";
}

export function parteSugerida(tipo: TipoDeParte, moeda: Moeda, primeiraData: string): ParteDaForma {
  return comParcelasGeradas({ ...SUGESTOES[tipo], currency: moeda, total: 0, parcelas: [] }, primeiraData);
}

/** Um dia de verdade no formato `AAAA-MM-DD` — "2026-02-31" não é. */
export function diaValido(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const [ano, mes, dia] = data.split("-").map(Number) as [number, number, number];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/**
 * Até 2 casas decimais. Pelos centavos, e não por `Number.isInteger(v * 100)`:
 * 2999.99 * 100 não é um inteiro exato em ponto flutuante.
 */
function duasCasas(valor: number): boolean {
  return Number.isFinite(valor) && emMoeda(emCentavos(valor)) === valor;
}

/**
 * As parcelas da parte, de novo, a partir do total, do número e da 1ª data.
 *
 * Nunca lança: com o campo vazio no meio da digitação (número apagado, data
 * limpa), as parcelas somem e `erroDaParte` diz o que falta, em vez de
 * derrubar a janela. No cartão é sempre uma parcela com o total: a Duli recebe
 * tudo de uma vez (decisão do Renato, 21/nov).
 */
export function comParcelasGeradas(parte: ParteDaForma, primeiraData: string): ParteDaForma {
  const cartao = parte.method === "cartao";
  const quantidade = cartao ? 1 : parte.installments_count;
  const semParcelas = { ...parte, installments_count: quantidade, parcelas: [] };

  if (!Number.isFinite(parte.total) || !diaValido(primeiraData)) return semParcelas;
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > LIMITES.parcelas) {
    return semParcelas;
  }

  return {
    ...parte,
    installments_count: quantidade,
    parcelas: gerarParcelas({ total: parte.total, quantidade, primeiroVencimento: primeiraData }),
  };
}

/**
 * A primeira falha da parte, ou nulo. A ordem é a mesma do banco: rótulo →
 * total → número de parcelas → lista → cada parcela → soma. Com o número ou a
 * lista errados, a soma não é conferida.
 */
export function erroDaParte(parte: ParteDaForma): string | null {
  const rotulo = parte.label.trim();
  if (rotulo.length < 1 || rotulo.length > LIMITES.rotulo) {
    return "Dê um nome à parte, com até 80 caracteres.";
  }

  if (!Number.isFinite(parte.total) || parte.total <= 0) return `Informe o valor de ${rotulo}.`;
  if (parte.total > VALOR_MAXIMO) return `O valor de ${rotulo} passa do limite.`;
  if (!duasCasas(parte.total)) return `Use no máximo 2 casas decimais em ${rotulo}.`;

  const n = parte.installments_count;
  if (parte.method === "cartao") {
    if (n !== 1) return "Cartão é um pagamento só, numa data.";
  } else if (!Number.isInteger(n) || n < 1 || n > LIMITES.parcelas) {
    return "Parcelas vão de 1 a 36.";
  }

  if (parte.parcelas.length !== n || parte.parcelas.some((p, i) => p.number !== i + 1)) {
    return `O número de parcelas de ${rotulo} não bate com a lista.`;
  }

  for (const p of parte.parcelas) {
    if (!Number.isFinite(p.amount) || p.amount <= 0) return `Cada parcela de ${rotulo} precisa de valor.`;
    if (!duasCasas(p.amount)) return `Use no máximo 2 casas decimais em ${rotulo}.`;
    if (!diaValido(p.due_on)) return `A data da parcela ${p.number} de ${rotulo} não é válida.`;
  }

  const somaCent = parte.parcelas.reduce((s, p) => s + emCentavos(p.amount), 0);
  const totalCent = emCentavos(parte.total);
  if (somaCent !== totalCent) {
    return (
      `As parcelas de ${rotulo} somam ${formatarMoeda(emMoeda(somaCent), parte.currency)}; ` +
      `o total é ${formatarMoeda(parte.total, parte.currency)}.`
    );
  }

  return null;
}

/** A 11ª parte, ou o primeiro erro das partes, ou nulo. */
export function erroDaForma(partes: ParteDaForma[]): string | null {
  if (partes.length > LIMITES.partes) return "A forma vai até 10 partes.";
  for (const parte of partes) {
    const erro = erroDaParte(parte);
    if (erro) return erro;
  }
  return null;
}

/** O total por moeda, em centavos — 0,1 + 0,2 dá 0,3. */
export function totaisDaForma(partes: Pick<ParteDaForma, "total" | "currency">[]): PorMoeda {
  const cent: Record<string, number> = {};
  for (const p of partes) cent[p.currency] = (cent[p.currency] ?? 0) + emCentavos(p.total);
  return Object.fromEntries(Object.entries(cent).map(([moeda, c]) => [moeda, emMoeda(c)]));
}

/** "R$ 10.000 + US$ 9.000": real antes de dólar, nunca somados. */
export function totalDaForma(partes: Pick<ParteDaForma, "total" | "currency">[]): string {
  return Object.entries(totaisDaForma(partes))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([moeda, valor]) => formatarMoeda(valor, moeda))
    .join(" + ");
}

/**
 * Vistos e partes todos na mesma moeda, com totais diferentes: avisa, sem
 * bloquear. Com moedas misturadas não há o que comparar — os dois totais
 * aparecem lado a lado.
 */
export function avisoDeCoerencia(
  itens: { amount: number; currency: string }[],
  partes: Pick<ParteDaForma, "total" | "currency">[],
): string | null {
  if (partes.length === 0 || itens.length === 0) return null;

  const moedas = new Set([...itens.map((i) => i.currency), ...partes.map((p) => p.currency)]);
  if (moedas.size !== 1) return null;
  const [moeda] = moedas as Set<string>;

  const forma = partes.reduce((s, p) => s + emCentavos(p.total), 0);
  const vistos = itens.reduce((s, i) => s + emCentavos(i.amount), 0);
  if (forma === vistos) return null;

  return (
    `A forma soma ${formatarMoeda(emMoeda(forma), moeda!)} ` +
    `e os vistos, ${formatarMoeda(emMoeda(vistos), moeda!)}.`
  );
}

/**
 * A parte numa linha, para o cartão do lead e a confirmação: "Entrada · Pix ·
 * R$ 10.000 · 10/11/2026" ou "Parcelas · Transferência · 3 × US$ 3.000 ·
 * 10/12/2026, 10/01/2027, 10/02/2027".
 *
 * `due_on` é dia, não instante (`formatarDia`). Parcelas que não dividem igual
 * (R$ 10.000 em 3) mostram o total, em vez de um "3 ×" que não é verdade; mais
 * de 4 datas viram a primeira e a última.
 */
export function linhaDaParte(parte: ParteDaForma): string {
  const { parcelas } = parte;
  const inicio = `${parte.label} · ${ROTULO_DO_METODO[parte.method]}`;
  const datas = parcelas.map((p) => formatarDia(p.due_on));

  if (parcelas.length <= 1) {
    return `${inicio} · ${formatarMoeda(parte.total, parte.currency)} · ${datas[0] ?? "—"}`;
  }

  const primeira = parcelas[0]!.amount;
  const valor = parcelas.every((p) => emCentavos(p.amount) === emCentavos(primeira))
    ? `${parcelas.length} × ${formatarMoeda(primeira, parte.currency)}`
    : `${parcelas.length} parcelas, ${formatarMoeda(parte.total, parte.currency)}`;
  const quando = datas.length <= 4 ? datas.join(", ") : `de ${datas[0]} a ${datas.at(-1)}`;

  return `${inicio} · ${valor} · ${quando}`;
}

/** Parcelas com vencimento antes de hoje (`AAAA-MM-DD` de São Paulo). */
export function avisoDeVencidas(
  partes: { parcelas: { due_on: string }[] }[],
  hoje: string,
): string | null {
  const vencidas = partes.flatMap((p) => p.parcelas).filter((p) => p.due_on < hoje).length;
  if (vencidas === 0) return null;
  return vencidas === 1 ? "1 parcela já vencida" : `${vencidas} parcelas já vencidas`;
}

/**
 * Os avisos que a forma acrescenta ao resumo do Ganho (P1 do plano da 4a),
 * montados aqui a partir do que `ganhar_negocio` devolve — a mesma frase de
 * coerência da janela e da confirmação. Nada bloqueia.
 *
 * - Parcela vencida, só com a forma confirmada: só aí a parcela vai nascer.
 * - Coerência, com a forma em rascunho (ou enviada/recusada) e confirmada.
 * - Com as cobranças já criadas, a forma é registro e não se compara: avisa
 *   cada visto que ganha processo agora, porque a cobrança dele é à mão.
 */
export function avisosDoResumo(resumo: ResumoDoGanho, hoje: string): string[] {
  const { forma } = resumo;

  if (forma.situacao === "sem_forma") return [];

  if (forma.situacao === "cobrancas_criadas") {
    const nomeDoItem = new Map(resumo.itens.map((i) => [i.id, i.visa_name]));
    return resumo.processos.map(
      (p) =>
        `${nomeDoItem.get(p.item) ?? p.titulo} não está na forma de pagamento: ` +
        "crie a cobrança à mão na aba Financeiro.",
    );
  }

  const avisos: string[] = [];
  if (forma.situacao === "confirmada") {
    const vencidas = avisoDeVencidas(forma.partes, hoje);
    if (vencidas) avisos.push(vencidas);
  }
  const coerencia = avisoDeCoerencia(resumo.itens, forma.partes);
  if (coerencia) avisos.push(coerencia);
  return avisos;
}
