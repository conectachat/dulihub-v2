/**
 * Montagem da linha do tempo da pessoa, pura: notas e atividades numa lista
 * só, da mais recente para a mais antiga.
 *
 * Mora aqui, e não em `timeline-queries.ts`, para ser testada sem banco: a
 * consulta usa o cliente de servidor, e a regra do que é "do sistema" e da
 * ordem é justamente o que a tela promete (spec §6.2: a nota do lead aparece
 * abaixo de "Oportunidade ganha — virou cliente").
 */

export type TimelineItem = {
  id: string;
  kind: "note" | "activity";
  /** Para atividade: o tipo registrado. Para nota: sempre "note". */
  type: string;
  body: string;
  occurredAt: string;
  authorId: string | null;
  authorName: string | null;
  /** Registro gerado pelo sistema não se edita nem se apaga. */
  system: boolean;
};

type Autor = { full_name: string | null; email: string } | null;

export type NotaLida = {
  id: string;
  body: string;
  created_at: string;
  created_by: string | null;
  author: Autor;
};

export type AtividadeLida = {
  id: string;
  type: string;
  description: string | null;
  occurred_at: string;
  created_by: string | null;
  author: Autor;
};

/**
 * Tipos que o sistema grava sozinho — não são lançamentos de quem usa, e não
 * se editam nem se apagam, nem pela API (`deleteEntry`). `virou_cliente` vem
 * do banco (0045) e do Ganho; `forma_de_pagamento`, da confirmação e do
 * Refazer da forma (0058).
 */
export const TIPOS_DO_SISTEMA = [
  "stage_change",
  "registration_submitted",
  "virou_cliente",
  "forma_de_pagamento",
];

const SYSTEM_TYPES = new Set(TIPOS_DO_SISTEMA);

const nomeDe = (autor: Autor) => autor?.full_name ?? autor?.email ?? null;

export function montarLinhaDoTempo(
  notas: NotaLida[],
  atividades: AtividadeLida[],
): TimelineItem[] {
  const deNotas: TimelineItem[] = notas.map((r) => ({
    id: r.id,
    kind: "note",
    type: "note",
    body: r.body,
    occurredAt: r.created_at,
    authorId: r.created_by,
    authorName: nomeDe(r.author),
    system: false,
  }));

  const deAtividades: TimelineItem[] = atividades.map((r) => ({
    id: r.id,
    kind: "activity",
    type: r.type,
    body: r.description ?? "",
    occurredAt: r.occurred_at,
    authorId: r.created_by,
    authorName: nomeDe(r.author),
    system: SYSTEM_TYPES.has(r.type),
  }));

  return [...deNotas, ...deAtividades].sort(
    (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
  );
}
