import { z } from "zod";

import { METODOS, type Metodo } from "@/lib/parcelas";
import { formatarMoeda } from "@/lib/totals";

/**
 * A forma de pagamento como o cliente a vê (entrega 4b) — puro, testado em
 * `forma-do-cliente.test.ts`.
 *
 * O formato é o de `private.copia_da_forma` (0064): a mesma função monta a
 * forma que a ficha pública mostra e a cópia que fica como prova da resposta.
 * A prévia do envio, na tela do lead, monta o mesmo formato com
 * `formaParaOCliente`, e as duas desenham com `FormaDePagamentoDoCliente`. O
 * cliente confirmar uma coisa e a prova guardar outra é o defeito que este
 * arquivo existe para impedir.
 *
 * Mora em `lib/` porque a ficha (`features/cadastro`) e o lead
 * (`features/opportunities`) precisam dele, e uma feature não importa de outra.
 * Nunca leva a cotação: o cliente vê os dois valores, não a conta (FIC-13).
 */

export type ParteParaOCliente = {
  label: string;
  method: Metodo;
  currency: "BRL" | "USD";
  total: number;
  /** A parte em reais diz de quantos dólares veio. Nula: sem conversão. */
  usd_equivalent: number | null;
  parcelas: { number: number; amount: number; due_on: string }[];
};

export type FormaParaOCliente = {
  vistos: { visa_name: string; amount: number; currency: string }[];
  partes: ParteParaOCliente[];
};

/** O `jsonb` do banco. Chave a mais (o `id` da parte) é ignorada. */
export const formaParaOClienteSchema = z.object({
  vistos: z.array(z.object({ visa_name: z.string(), amount: z.number(), currency: z.string() })),
  partes: z.array(
    z.object({
      label: z.string(),
      method: z.enum(METODOS),
      currency: z.enum(["BRL", "USD"]),
      total: z.number(),
      // Cópia de antes da 4b não tem a chave: lê-se como "sem conversão".
      usd_equivalent: z.number().nullable().default(null),
      parcelas: z.array(z.object({ number: z.number(), amount: z.number(), due_on: z.string() })),
    }),
  ),
});

/** "US$ 3.900 convertidos para R$ 21.527,76", ou só o valor da parte. */
export function valorComConversao(
  total: number,
  currency: "BRL" | "USD",
  usdEquivalent: number | null,
): string {
  if (usdEquivalent === null) return formatarMoeda(total, currency);
  return `${formatarMoeda(usdEquivalent, "USD")} convertidos para ${formatarMoeda(total, currency)}`;
}

/** A prévia do envio: os vistos e as partes do lead, no formato da cópia. */
export function formaParaOCliente(
  itens: { visa_name: string; amount: number; currency: string }[],
  partes: ParteParaOCliente[],
): FormaParaOCliente {
  return {
    vistos: itens.map(({ visa_name, amount, currency }) => ({ visa_name, amount, currency })),
    partes: partes.map(({ label, method, currency, total, usd_equivalent, parcelas }) => ({
      label,
      method,
      currency,
      total,
      usd_equivalent,
      parcelas: parcelas.map(({ number, amount, due_on }) => ({ number, amount, due_on })),
    })),
  };
}
