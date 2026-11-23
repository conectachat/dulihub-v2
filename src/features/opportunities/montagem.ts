import { z } from "zod";

import { METODOS } from "@/lib/parcelas";

import type { ParteDaForma } from "./forma-regras";

/**
 * A forma de pagamento como o lead a lê (entrega 4a) — pura, testada em
 * `montagem.test.ts`.
 *
 * O PostgREST devolve a forma embutida em **lista**: o único de
 * `payment_plans` é só `(opportunity_id)`, e a chave para o negócio é
 * composta, então ele não sabe que é uma só. As partes e as parcelas vêm na
 * ordem que vier; aqui se põem por posição e por número.
 *
 * Método e moeda passam por esquema, como os totais de `listarEncerradas`:
 * o banco tem `check` nos dois, e um valor fora da lista vira erro em vez de
 * uma parte que a janela não sabe desenhar.
 */

const FORMATO_INESPERADO = "O servidor respondeu num formato inesperado.";

const linhaSchema = z.object({
  id: z.string(),
  status: z.enum(["rascunho", "enviada", "recusada", "confirmada"]),
  reference_rate: z.number().nullable(),
  reference_rate_note: z.string().nullable(),
  charges_created_at: z.string().nullable(),
  partes: z.array(
    z.object({
      position: z.number(),
      label: z.string(),
      method: z.enum(METODOS),
      currency: z.enum(["BRL", "USD"]),
      total: z.number(),
      installments_count: z.number(),
      // A coluna nasce na 0064; até lá, e na linha antiga, sem conversão.
      usd_equivalent: z.number().nullable().default(null),
      parcelas: z.array(z.object({ number: z.number(), amount: z.number(), due_on: z.string() })),
    }),
  ),
  respostas: z.array(
    z.object({
      answered_at: z.string(),
      created_at: z.string(),
      answered_by_name: z.string().nullable(),
      reason: z.string().nullable(),
    }),
  ),
});

export type FormaDoNegocio = {
  id: string;
  status: z.infer<typeof linhaSchema>["status"];
  reference_rate: number | null;
  reference_rate_note: string | null;
  charges_created_at: string | null;
  partes: ParteDaForma[];
  /** A confirmação que vale: depois de Refazer e confirmar de novo, a última. */
  ultimaResposta: { answered_at: string; answered_by_name: string | null; reason: string | null } | null;
};

export function formaDoNegocio(linhas: unknown[]): {
  forma: FormaDoNegocio | null;
  error: string | null;
} {
  if (linhas.length === 0) return { forma: null, error: null };

  const lida = linhaSchema.safeParse(linhas[0]);
  if (!lida.success) return { forma: null, error: FORMATO_INESPERADO };
  const { partes, respostas, ...forma } = lida.data;

  const [ultima] = [...respostas].sort(
    (a, b) => b.answered_at.localeCompare(a.answered_at) || b.created_at.localeCompare(a.created_at),
  );

  return {
    forma: {
      ...forma,
      partes: [...partes]
        .sort((a, b) => a.position - b.position)
        .map((p) => ({
          label: p.label,
          method: p.method,
          currency: p.currency,
          total: p.total,
          installments_count: p.installments_count,
          usd_equivalent: p.usd_equivalent,
          parcelas: [...p.parcelas].sort((a, b) => a.number - b.number),
        })),
      ultimaResposta: ultima
        ? { answered_at: ultima.answered_at, answered_by_name: ultima.answered_by_name, reason: ultima.reason }
        : null,
    },
    error: null,
  };
}
