import { z } from "zod";

import { parseMoney, parseWholeNumber } from "@/lib/numbers";

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

export const METODOS = ["pix", "boleto", "cartao", "transferencia", "cripto"] as const;

export const ROTULO_DO_METODO: Record<(typeof METODOS)[number], string> = {
  pix: "Pix",
  boleto: "Boleto",
  cartao: "Cartão",
  transferencia: "Transferência",
  cripto: "Cripto",
};

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
    paid_rate: dinheiro,
    moeda: z.enum(["BRL", "USD"]),
  })
  // Em dólar, sem cotação não há como dizer quanto entrou no caixa. Guardar
  // a baixa assim faria o fechamento do mês somar dólar como se fosse real.
  .refine((d) => d.moeda === "BRL" || (d.paid_rate !== null && d.paid_rate > 0), {
    message: "Informe a cotação do dólar no dia do pagamento",
    path: ["paid_rate"],
  });
