import { z } from "zod";

import { parseCotacao, parseMoney, parseWholeNumber } from "@/lib/numbers";
import { METODOS } from "@/lib/parcelas";

/**
 * O que vale como entrada no a receber — puro, e o mesmo dos dois lados.
 *
 * `parseMoney` existe porque duas cópias antigas tiravam todos os pontos e
 * trocavam vírgula por ponto, transformando `2000.00` em `200000`: cem vezes
 * o valor, gravado em silêncio num campo que vira cobrança.
 */

const dinheiro = z.string().nullish().transform(parseMoney);

const dataISO = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do primeiro vencimento");

export const cobrancaSchema = z
  .object({
    person_id: z.string().uuid("Cliente não informado"),
    project_id: z
      .string()
      .nullish()
      .transform((v) => (typeof v === "string" && v ? v : null)),
    title: z.string().trim().min(1, "Informe o que está sendo cobrado").max(120),
    amount: dinheiro,
    list_amount: dinheiro,
    currency: z.enum(["BRL", "USD"]).default("BRL"),
    quantidade: z
      .string()
      .nullish()
      .transform(parseWholeNumber),
    primeiro_vencimento: dataISO,
    entrada: dinheiro,
    method: z.enum(METODOS).default("pix"),
  })
  .refine((d) => d.amount !== null && d.amount > 0, {
    message: "Informe o valor da cobrança",
    path: ["amount"],
  })
  .refine((d) => d.quantidade !== null && d.quantidade >= 1 && d.quantidade <= 36, {
    message: "O número de parcelas vai de 1 a 36",
    path: ["quantidade"],
  })
  // Desconto é abater. Valor de tabela menor que o cobrado seria acréscimo
  // disfarçado, e o banco recusaria depois — melhor recusar na frente de quem
  // digitou.
  .refine((d) => d.list_amount === null || d.list_amount >= (d.amount ?? 0), {
    message: "O valor de tabela não pode ser menor que o valor cobrado",
    path: ["list_amount"],
  })
  .transform((d) => ({
    ...d,
    amount: d.amount as number,
    quantidade: d.quantidade as number,
  }));

export const baixaSchema = z
  .object({
    id: z.string().uuid("Parcela não informada"),
    paid_on: dataISO,
    // Cotação tem regra própria: "5,425" é cinco e quatrocentos e vinte e
    // cinco milésimos, não milhar (G3).
    paid_rate: z.string().nullish().transform(parseCotacao),
    moeda: z.enum(["BRL", "USD"]),
  })
  // Em dólar a cotação é opcional (24/nov): o dinheiro pode ficar em dólar
  // (Nomad, C6 Global, Binance) e ser convertido depois, juntando vários — não
  // há cotação do dia. Sem ela, a parcela fica paga em US$ e fora do recebido
  // em reais (`recebidoNoMes`), em vez de inventar quanto entrou.
  //
  // Digitada, tem de ser de verdade: zero o banco recusa (0063), e um dólar
  // nunca valeu cem reais — passou disso, foi dígito a mais ou separador
  // trocado, e o erro iria direto para o fechamento do mês.
  .refine((d) => d.paid_rate === null || (d.paid_rate > 0 && d.paid_rate < 100), {
    message: "Cotação fora do normal — confira (ex.: 5,42)",
    path: ["paid_rate"],
  });

/**
 * Mudar o vencimento de uma parcela em aberto (24/nov): o cliente combinou
 * pagar depois, e a parcela não pode aparecer como atrasada.
 */
export const vencimentoSchema = z.object({
  id: z.string().uuid("Parcela não informada"),
  due_on: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o novo vencimento"),
});
