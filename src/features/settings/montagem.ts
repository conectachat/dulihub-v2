import type { Pendencia } from "@/lib/local/sobreposicao";
import type { Tables } from "@/lib/supabase/database.types";

/**
 * As contagens e junções da tela de Configuração — puras, testadas em
 * `montagem.test.ts`.
 *
 * Nenhuma delas é coluna no banco. Vivem aqui porque **dois caminhos** as
 * usam: o servidor (`queries.ts`) e o espelho offline
 * (`consultas-locais.ts`). Uma cópia em cada lado mostraria números
 * diferentes com e sem internet, e ninguém desconfiaria — o tipo de
 * divergência que a Fase 2.5 existe para evitar.
 *
 * Os tipos carregam `Pendencia`: a linha sabe dizer se ainda não subiu, ou se
 * foi recusada e por quê. Fica no tipo, e não num paralelo qualquer, para que
 * uma tela nova não consiga esquecer de mostrar isso.
 */

export type EtapaDoFunil = Pick<
  Tables<"pipeline_stages">,
  "id" | "name" | "position" | "is_won" | "is_lost"
> &
  Pendencia & { opportunity_count: number };

export type TagComContagem = Pick<Tables<"tags">, "id" | "name" | "color"> &
  Pendencia & { person_count: number };

export type PastaDoCatalogo = Pick<
  Tables<"document_types">,
  "id" | "parent_id" | "name" | "position"
> &
  Pendencia;

export type StatusDeEtapa = Pick<
  Tables<"stage_statuses">,
  "id" | "code" | "label" | "color" | "position" | "is_default" | "is_done" | "is_system"
> &
  Pendencia;

export type EtapaDoVisto = Pick<
  Tables<"visa_stages">,
  "id" | "parent_id" | "name" | "position" | "is_required" | "estimated_days"
> &
  Pendencia;

export type ExigenciaDoVisto = Pick<
  Tables<"visa_type_documents">,
  "id" | "document_type_id" | "is_required" | "deadline_days" | "position"
> &
  Pendencia;

function contarPor<T>(linhas: T[], chave: (linha: T) => string) {
  const mapa = new Map<string, number>();
  for (const linha of linhas) {
    const k = chave(linha);
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  return mapa;
}

export function etapasComContagem<
  T extends Pick<Tables<"pipeline_stages">, "id" | "name" | "position" | "is_won" | "is_lost">,
>(etapas: T[], negocios: { stage_id: string }[]): (T & { opportunity_count: number })[] {
  const contagem = contarPor(negocios, (n) => n.stage_id);
  return etapas.map((e) => ({ ...e, opportunity_count: contagem.get(e.id) ?? 0 }));
}

export function tagsComContagem<T extends Pick<Tables<"tags">, "id" | "name" | "color">>(
  tags: T[],
  vinculos: { tag_id: string }[],
): (T & { person_count: number })[] {
  const contagem = contarPor(vinculos, (v) => v.tag_id);
  return tags.map((t) => ({ ...t, person_count: contagem.get(t.id) ?? 0 }));
}

/**
 * Quais vistos exigem cada pasta.
 *
 * É o que o aviso de exclusão lê: `visa_type_documents` tem cascade, então
 * apagar a pasta tira a exigência de todos eles.
 */
export function usosDoCatalogo(
  exigencias: { document_type_id: string; nome: string }[],
): Record<string, string[]> {
  const usos: Record<string, string[]> = {};
  for (const e of exigencias) (usos[e.document_type_id] ??= []).push(e.nome);
  return usos;
}

export function contagemPorVisto(linhas: { visa_type_id: string }[]): Record<string, number> {
  return Object.fromEntries(contarPor(linhas, (l) => l.visa_type_id));
}
