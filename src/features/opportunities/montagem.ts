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
  updated_at: z.string(),
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
      decision: z.enum(["confirmada", "recusada", "confirmada_pela_equipe"]),
    }),
  ),
  // Os links da ficha com esta forma (4b), pela chave `registration_forms_plan_same_org`.
  links: z
    .array(
      z.object({
        id: z.string(),
        token: z.string(),
        expires_at: z.string(),
        created_at: z.string(),
        closed_at: z.string().nullable(),
        cancelled_at: z.string().nullable(),
      }),
    )
    .default([]),
});

export type FormaDoNegocio = {
  id: string;
  status: z.infer<typeof linhaSchema>["status"];
  /**
   * A versão que a prévia do envio leva a `enviar_forma_de_pagamento`: o texto
   * como veio, com os microssegundos — `new Date()` os perderia, e todo envio
   * seria recusado com "mudou enquanto você olhava".
   */
  updated_at: string;
  reference_rate: number | null;
  reference_rate_note: string | null;
  charges_created_at: string | null;
  partes: ParteDaForma[];
  /** A confirmação que vale: depois de Refazer e confirmar de novo, a última. */
  ultimaResposta: {
    answered_at: string;
    answered_by_name: string | null;
    reason: string | null;
    decision: "confirmada" | "recusada" | "confirmada_pela_equipe";
  } | null;
  /** O link da ficha com esta forma ainda aberto (vencido ou não): o mais recente. */
  linkAberto: { id: string; token: string; expires_at: string; created_at: string } | null;
};

type LinkLido = z.infer<typeof linhaSchema>["links"][number];

function abertoMaisRecente(links: LinkLido[]): FormaDoNegocio["linkAberto"] {
  const [aberto] = links
    .filter((l) => l.closed_at === null && l.cancelled_at === null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return aberto
    ? { id: aberto.id, token: aberto.token, expires_at: aberto.expires_at, created_at: aberto.created_at }
    : null;
}

export function formaDoNegocio(linhas: unknown[]): {
  forma: FormaDoNegocio | null;
  error: string | null;
} {
  if (linhas.length === 0) return { forma: null, error: null };

  const lida = linhaSchema.safeParse(linhas[0]);
  if (!lida.success) return { forma: null, error: FORMATO_INESPERADO };
  const { partes, respostas, links, ...forma } = lida.data;

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
        ? {
            answered_at: ultima.answered_at,
            answered_by_name: ultima.answered_by_name,
            reason: ultima.reason,
            decision: ultima.decision,
          }
        : null,
      linkAberto: abertoMaisRecente(links),
    },
    error: null,
  };
}
