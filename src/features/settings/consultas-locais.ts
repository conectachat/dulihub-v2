"use client";

import type { BancoLocal } from "@/lib/local/banco";
import type { Tables } from "@/lib/supabase/database.types";

import {
  contagemPorVisto,
  etapasComContagem,
  tagsComContagem,
  usosDoCatalogo,
  type EtapaDoFunil,
  type EtapaDoVisto,
  type ExigenciaDoVisto,
  type PastaDoCatalogo,
  type StatusDeEtapa,
  type TagComContagem,
} from "./montagem";

/**
 * As mesmas leituras da Configuração, do espelho no aparelho.
 *
 * Os tipos e as contagens vêm de `montagem.ts`, compartilhado — é o que
 * permite a tela ser uma só, com e sem internet, sem duas implementações
 * da mesma leitura divergindo em silêncio.
 *
 * Aqui não há canal de erro: ler o próprio aparelho não falha por rede. O
 * que pode haver é espelho **vazio** (aparelho novo, primeira abertura), e
 * isso a tela distingue de "não existe" — a confusão que a 0011 documentou.
 */

const porPosicao = <T extends { position: number }>(linhas: T[]) =>
  [...linhas].sort((a, b) => a.position - b.position);

type Linhas = Record<string, unknown>[];

/** Lê uma tabela do espelho. Fora do tipo gerado: o Dexie guarda linha crua. */
async function ler(banco: BancoLocal, tabela: string): Promise<Linhas> {
  return (await banco.tabela(tabela).toArray()) as unknown as Linhas;
}

export async function etapasDoFunilLocal(banco: BancoLocal): Promise<{
  funil: Pick<Tables<"pipelines">, "id" | "name"> | null;
  etapas: EtapaDoFunil[];
}> {
  const [funis, etapas, negocios] = await Promise.all([
    ler(banco, "pipelines"),
    ler(banco, "pipeline_stages"),
    ler(banco, "opportunities"),
  ]);

  const funil = (funis as Tables<"pipelines">[]).find((f) => f.is_default) ?? null;
  if (!funil) return { funil: null, etapas: [] };

  const doFunil = (etapas as Tables<"pipeline_stages">[]).filter(
    (e) => e.pipeline_id === funil.id,
  );

  return {
    funil: { id: funil.id, name: funil.name },
    etapas: etapasComContagem(
      porPosicao(doFunil).map(({ id, name, position, is_won, is_lost }) => ({
        id,
        name,
        position,
        is_won,
        is_lost,
      })),
      negocios as { stage_id: string }[],
    ),
  };
}

export async function tagsLocais(banco: BancoLocal): Promise<TagComContagem[]> {
  const [tags, vinculos] = await Promise.all([
    ler(banco, "tags"),
    ler(banco, "person_tags"),
  ]);

  const ordenadas = (tags as Tables<"tags">[])
    .map(({ id, name, color }) => ({ id, name, color }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return tagsComContagem(ordenadas, vinculos as { tag_id: string }[]);
}

export async function catalogoLocal(banco: BancoLocal): Promise<{
  pastas: PastaDoCatalogo[];
  usos: Record<string, string[]>;
}> {
  const [pastas, exigencias, vistos] = await Promise.all([
    ler(banco, "document_types"),
    ler(banco, "visa_type_documents"),
    ler(banco, "visa_types"),
  ]);

  const nomeDoVisto = new Map(
    (vistos as Tables<"visa_types">[]).map((v) => [v.id, v.name]),
  );

  return {
    pastas: porPosicao(pastas as Tables<"document_types">[]).map(
      ({ id, parent_id, name, position }) => ({ id, parent_id, name, position }),
    ),
    usos: usosDoCatalogo(
      (exigencias as Tables<"visa_type_documents">[]).map((e) => ({
        document_type_id: e.document_type_id,
        nome: nomeDoVisto.get(e.visa_type_id) ?? "Tipo de visto removido",
      })),
    ),
  };
}

export async function statusDeEtapaLocal(banco: BancoLocal): Promise<StatusDeEtapa[]> {
  const linhas = await ler(banco, "stage_statuses");
  return porPosicao(linhas as Tables<"stage_statuses">[]).map(
    ({ id, code, label, color, position, is_default, is_done, is_system }) => ({
      id,
      code,
      label,
      color,
      position,
      is_default,
      is_done,
      is_system,
    }),
  );
}

export async function tiposDeVistoLocais(banco: BancoLocal): Promise<{
  tipos: Tables<"visa_types">[];
  etapasPorTipo: Record<string, number>;
  documentosPorTipo: Record<string, number>;
}> {
  const [tipos, etapas, documentos] = await Promise.all([
    ler(banco, "visa_types"),
    ler(banco, "visa_stages"),
    ler(banco, "visa_type_documents"),
  ]);

  return {
    // Mesma ordem do servidor: posição e, empatando, nome.
    tipos: (tipos as Tables<"visa_types">[]).sort(
      (a, b) => a.position - b.position || a.name.localeCompare(b.name, "pt-BR"),
    ),
    etapasPorTipo: contagemPorVisto(etapas as { visa_type_id: string }[]),
    documentosPorTipo: contagemPorVisto(documentos as { visa_type_id: string }[]),
  };
}

export async function tipoDeVistoLocal(
  banco: BancoLocal,
  visaId: string,
): Promise<{
  visto: Tables<"visa_types"> | null;
  etapas: EtapaDoVisto[];
  catalogo: PastaDoCatalogo[];
  exigencias: ExigenciaDoVisto[];
}> {
  const [tipos, etapas, catalogo, exigencias] = await Promise.all([
    ler(banco, "visa_types"),
    ler(banco, "visa_stages"),
    ler(banco, "document_types"),
    ler(banco, "visa_type_documents"),
  ]);

  return {
    visto: (tipos as Tables<"visa_types">[]).find((v) => v.id === visaId) ?? null,
    etapas: porPosicao(
      (etapas as Tables<"visa_stages">[]).filter((e) => e.visa_type_id === visaId),
    ).map(({ id, parent_id, name, position, is_required, estimated_days }) => ({
      id,
      parent_id,
      name,
      position,
      is_required,
      estimated_days,
    })),
    catalogo: porPosicao(catalogo as Tables<"document_types">[]).map(
      ({ id, parent_id, name, position }) => ({ id, parent_id, name, position }),
    ),
    exigencias: (exigencias as Tables<"visa_type_documents">[])
      .filter((e) => e.visa_type_id === visaId)
      .map(({ id, document_type_id, is_required, deadline_days, position }) => ({
        id,
        document_type_id,
        is_required,
        deadline_days,
        position,
      })),
  };
}
