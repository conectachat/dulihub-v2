import type { Tables } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Leituras da Configuração.
 *
 * Estavam escritas dentro de `configuracoes/[section]/page.tsx`, cada seção
 * com seu `createClient()` e devolvendo `<QueryError>` de dentro. Saíram para
 * cá porque o espelho offline (Fase 2.5) precisa de **uma** definição do que
 * cada tela lê e de como ela devolve erro — duas implementações divergem em
 * silêncio, e é o tipo de divergência que só aparece quando o avião decola.
 *
 * Mesmo contrato de `people/queries.ts`: devolve `{ ..., error }` com
 * `error.message` cru. Tradução é coisa de Server Action (`traduzirErro`);
 * aqui o texto vai para a caixa de diagnóstico.
 *
 * As contagens (`opportunity_count`, `person_count`, quantas etapas cada
 * visto tem) **não são colunas** — são montadas aqui, depois da consulta,
 * como já eram na página. O espelho vai montá-las do mesmo jeito.
 */

export type EtapaDoFunil = Pick<
  Tables<"pipeline_stages">,
  "id" | "name" | "position" | "is_won" | "is_lost"
> & { opportunity_count: number };

export type TagComContagem = Pick<Tables<"tags">, "id" | "name" | "color"> & {
  person_count: number;
};

export type PastaDoCatalogo = Pick<
  Tables<"document_types">,
  "id" | "parent_id" | "name" | "position"
>;

export type StatusDeEtapa = Pick<
  Tables<"stage_statuses">,
  "id" | "code" | "label" | "color" | "position" | "is_default" | "is_done" | "is_system"
>;

export type EtapaDoVisto = Pick<
  Tables<"visa_stages">,
  "id" | "parent_id" | "name" | "position" | "is_required" | "estimated_days"
>;

export type ExigenciaDoVisto = Pick<
  Tables<"visa_type_documents">,
  "id" | "document_type_id" | "is_required" | "deadline_days" | "position"
>;

/** Conta ocorrências por chave — o padrão das contagens desta tela. */
function contarPor<T>(linhas: T[] | null, chave: (linha: T) => string) {
  const mapa = new Map<string, number>();
  for (const linha of linhas ?? []) {
    const k = chave(linha);
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  return mapa;
}

/** Funil padrão e suas etapas, com quantos negócios estão em cada uma. */
export async function etapasDoFunil(): Promise<{
  funil: Pick<Tables<"pipelines">, "id" | "name"> | null;
  etapas: EtapaDoFunil[];
  error: string | null;
}> {
  const supabase = await createClient();

  const { data: funil, error: erroDoFunil } = await supabase
    .from("pipelines")
    .select("id, name")
    .eq("is_default", true)
    .maybeSingle();

  // Erro antes de vazio, sempre: leitura falha não é "organização sem funil".
  if (erroDoFunil) return { funil: null, etapas: [], error: erroDoFunil.message };
  if (!funil) return { funil: null, etapas: [], error: null };

  const [{ data: etapas, error: erroDasEtapas }, { data: negocios, error: erroDaContagem }] =
    await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("id, name, position, is_won, is_lost")
        .eq("pipeline_id", funil.id)
        .order("position"),
      supabase.from("opportunities").select("stage_id"),
    ]);

  // A contagem também: zerada por erro, toda etapa parece vazia e segura de
  // excluir.
  const falha = erroDasEtapas ?? erroDaContagem;
  if (falha) return { funil, etapas: [], error: falha.message };

  const contagem = contarPor(negocios, (n) => n.stage_id);

  return {
    funil,
    etapas: (etapas ?? []).map((e) => ({
      ...e,
      opportunity_count: contagem.get(e.id) ?? 0,
    })),
    error: null,
  };
}

/** Tags da organização, com quantos contatos usam cada uma. */
export async function tagsComContagem(): Promise<{
  tags: TagComContagem[];
  error: string | null;
}> {
  const supabase = await createClient();

  const [{ data: tags, error: erroDasTags }, { data: vinculos, error: erroDosVinculos }] =
    await Promise.all([
      supabase.from("tags").select("id, name, color").order("name"),
      supabase.from("person_tags").select("tag_id"),
    ]);

  const falha = erroDasTags ?? erroDosVinculos;
  if (falha) return { tags: [], error: falha.message };

  const contagem = contarPor(vinculos, (v) => v.tag_id);

  return {
    tags: (tags ?? []).map((t) => ({ ...t, person_count: contagem.get(t.id) ?? 0 })),
    error: null,
  };
}

/**
 * Catálogo de pastas e quem exige cada uma.
 *
 * `usos` alimenta o aviso de exclusão: `visa_type_documents` tem cascade, e
 * apagar uma pasta tira a exigência de todo visto que a usava.
 */
export async function catalogoDeDocumentos(): Promise<{
  pastas: PastaDoCatalogo[];
  usos: Record<string, string[]>;
  error: string | null;
}> {
  const supabase = await createClient();

  const [{ data: pastas, error: erroDasPastas }, { data: exigencias, error: erroDasExigencias }] =
    await Promise.all([
      supabase.from("document_types").select("id, parent_id, name, position").order("position"),
      supabase.from("visa_type_documents").select("document_type_id, visa_types(name)"),
    ]);

  // Sem isto, uma leitura falha vira "Catálogo vazio" — e a reação a isso é
  // recriar as pastas, duplicando tudo. É o cenário que a 0011 documentou.
  const falha = erroDasPastas ?? erroDasExigencias;
  if (falha) return { pastas: [], usos: {}, error: falha.message };

  const usos: Record<string, string[]> = {};
  for (const linha of exigencias ?? []) {
    (usos[linha.document_type_id] ??= []).push(linha.visa_types.name);
  }

  return { pastas: pastas ?? [], usos, error: null };
}

/** Status que uma etapa de processo pode assumir. */
export async function statusDeEtapa(): Promise<{
  status: StatusDeEtapa[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stage_statuses")
    .select("id, code, label, color, position, is_default, is_done, is_system")
    .order("position");

  if (error) return { status: [], error: error.message };
  return { status: data ?? [], error: null };
}

/** Lista de tipos de visto, com quantas etapas e documentos cada um tem. */
export async function tiposDeVisto(): Promise<{
  tipos: Tables<"visa_types">[];
  etapasPorTipo: Record<string, number>;
  documentosPorTipo: Record<string, number>;
  error: string | null;
}> {
  const supabase = await createClient();

  const [
    { data: tipos, error: erroDosTipos },
    { data: etapas, error: erroDasEtapas },
    { data: documentos, error: erroDosDocumentos },
  ] = await Promise.all([
    supabase.from("visa_types").select("*").order("position").order("name"),
    supabase.from("visa_stages").select("visa_type_id"),
    supabase.from("visa_type_documents").select("visa_type_id"),
  ]);

  // Sem isto, uma leitura falha vira "Nenhum tipo de visto ainda. Crie o
  // primeiro" — convite para recriar o molde inteiro em cima do que existe.
  const falha = erroDosTipos ?? erroDasEtapas ?? erroDosDocumentos;
  if (falha) {
    return { tipos: [], etapasPorTipo: {}, documentosPorTipo: {}, error: falha.message };
  }

  return {
    tipos: tipos ?? [],
    etapasPorTipo: Object.fromEntries(contarPor(etapas, (e) => e.visa_type_id)),
    documentosPorTipo: Object.fromEntries(contarPor(documentos, (d) => d.visa_type_id)),
    error: null,
  };
}

/** Um tipo de visto: o molde de etapas e as pastas que ele exige. */
export async function tipoDeVisto(visaId: string): Promise<{
  visto: Tables<"visa_types"> | null;
  etapas: EtapaDoVisto[];
  catalogo: PastaDoCatalogo[];
  exigencias: ExigenciaDoVisto[];
  error: string | null;
}> {
  const supabase = await createClient();

  const [
    { data: visto, error: erroDoVisto },
    { data: etapas, error: erroDasEtapas },
    { data: catalogo, error: erroDoCatalogo },
    { data: exigencias, error: erroDasExigencias },
  ] = await Promise.all([
    supabase.from("visa_types").select("*").eq("id", visaId).maybeSingle(),
    supabase
      .from("visa_stages")
      .select("id, parent_id, name, position, is_required, estimated_days")
      .eq("visa_type_id", visaId)
      .order("position"),
    supabase.from("document_types").select("id, parent_id, name, position").order("position"),
    supabase
      .from("visa_type_documents")
      .select("id, document_type_id, is_required, deadline_days, position")
      .eq("visa_type_id", visaId),
  ]);

  // Leitura falha não é "não encontrado", e catálogo falho não é catálogo
  // vazio — as duas confusões levam a recriar o que já existe.
  const falha = erroDoVisto ?? erroDasEtapas ?? erroDoCatalogo ?? erroDasExigencias;
  if (falha) {
    return { visto: null, etapas: [], catalogo: [], exigencias: [], error: falha.message };
  }

  return {
    visto,
    etapas: etapas ?? [],
    catalogo: catalogo ?? [],
    exigencias: exigencias ?? [],
    error: null,
  };
}
