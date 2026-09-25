"use client";

import type { BancoDaFila } from "@/lib/local/banco-da-fila";
import type { BancoLocal } from "@/lib/local/banco";
import type { ItemDaFila } from "@/lib/local/fila";
import { lerTabela, pendentesDaFila } from "@/lib/local/leitura";
import type { Pendencia } from "@/lib/local/sobreposicao";
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
 * As mesmas leituras da Configuração, do espelho no aparelho — mais o que
 * ainda não subiu.
 *
 * Os tipos e as contagens vêm de `montagem.ts`, compartilhado — é o que
 * permite a tela ser uma só, com e sem internet, sem duas implementações
 * da mesma leitura divergindo em silêncio.
 *
 * O pendente não está no espelho: ele é posto por cima, por `sobrepor`. O
 * espelho continua sendo só a cópia do servidor, e é isso que deixa a
 * conferência pelo manifesto continuar valendo.
 *
 * Aqui não há canal de erro: ler o próprio aparelho não falha por rede. O
 * que pode haver é espelho **vazio** (aparelho novo, primeira abertura), e
 * isso a tela distingue de "não existe" — a confusão que a 0011 documentou.
 */

const porPosicao = <T extends { position: number }>(linhas: T[]) =>
  [...linhas].sort((a, b) => a.position - b.position);

type Linhas = (Record<string, unknown> & Pendencia)[];

const pendentes = pendentesDaFila;

const ler = (banco: BancoLocal, tabela: string, itens: ItemDaFila[]) =>
  lerTabela(banco, tabela, itens) as Promise<Linhas>;

type Com<T> = T & Pendencia;

/**
 * Uma linha crua do espelho, com a fila por cima.
 *
 * Existe para a gravação descobrir a que visto pertence uma etapa ou uma
 * exigência sem obrigar cada tela a carregar esse dado num campo escondido:
 * o aparelho já sabe, e perguntar a ele é mais difícil de errar do que
 * lembrar de preencher o formulário.
 */
export async function linhaLocal(
  banco: BancoLocal,
  fila: BancoDaFila,
  tabela: string,
  id: string,
): Promise<(Record<string, unknown> & Pendencia) | null> {
  const linhas = await ler(banco, tabela, await pendentes(fila));
  return linhas.find((l) => l.id === id) ?? null;
}

export async function etapasDoFunilLocal(
  banco: BancoLocal,
  fila: BancoDaFila,
): Promise<{
  funil: Pick<Tables<"pipelines">, "id" | "name"> | null;
  etapas: EtapaDoFunil[];
}> {
  const itens = await pendentes(fila);
  const [funis, etapas, negocios] = await Promise.all([
    ler(banco, "pipelines", itens),
    ler(banco, "pipeline_stages", itens),
    ler(banco, "opportunities", itens),
  ]);

  const funil = (funis as Tables<"pipelines">[]).find((f) => f.is_default) ?? null;
  if (!funil) return { funil: null, etapas: [] };

  const doFunil = (etapas as Com<Tables<"pipeline_stages">>[]).filter(
    (e) => e.pipeline_id === funil.id,
  );

  return {
    funil: { id: funil.id, name: funil.name },
    etapas: etapasComContagem(
      porPosicao(doFunil).map(
        ({ id, name, position, is_won, is_lost, pendente, conflito }) => ({
          id,
          name,
          position,
          is_won,
          is_lost,
          pendente,
          conflito,
        }),
      ),
      negocios as { stage_id: string }[],
    ),
  };
}

export async function tagsLocais(
  banco: BancoLocal,
  fila: BancoDaFila,
): Promise<TagComContagem[]> {
  const itens = await pendentes(fila);
  const [tags, vinculos] = await Promise.all([
    ler(banco, "tags", itens),
    ler(banco, "person_tags", itens),
  ]);

  const ordenadas = (tags as Com<Tables<"tags">>[])
    .map(({ id, name, color, pendente, conflito }) => ({
      id,
      name,
      color,
      pendente,
      conflito,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return tagsComContagem(ordenadas, vinculos as { tag_id: string }[]);
}

export async function catalogoLocal(
  banco: BancoLocal,
  fila: BancoDaFila,
): Promise<{
  pastas: PastaDoCatalogo[];
  usos: Record<string, string[]>;
}> {
  const itens = await pendentes(fila);
  const [pastas, exigencias, vistos] = await Promise.all([
    ler(banco, "document_types", itens),
    ler(banco, "visa_type_documents", itens),
    ler(banco, "visa_types", itens),
  ]);

  const nomeDoVisto = new Map(
    (vistos as Tables<"visa_types">[]).map((v) => [v.id, v.name]),
  );

  return {
    pastas: porPosicao(pastas as Com<Tables<"document_types">>[]).map(
      ({ id, parent_id, name, position, pendente, conflito }) => ({
        id,
        parent_id,
        name,
        position,
        pendente,
        conflito,
      }),
    ),
    usos: usosDoCatalogo(
      (exigencias as Tables<"visa_type_documents">[]).map((e) => ({
        document_type_id: e.document_type_id,
        nome: nomeDoVisto.get(e.visa_type_id) ?? "Tipo de visto removido",
      })),
    ),
  };
}

export async function statusDeEtapaLocal(
  banco: BancoLocal,
  fila: BancoDaFila,
): Promise<StatusDeEtapa[]> {
  const linhas = await ler(banco, "stage_statuses", await pendentes(fila));
  return porPosicao(linhas as Com<Tables<"stage_statuses">>[]).map(
    ({
      id,
      code,
      label,
      color,
      position,
      is_default,
      is_done,
      is_system,
      pendente,
      conflito,
    }) => ({
      id,
      code,
      label,
      color,
      position,
      is_default,
      is_done,
      is_system,
      pendente,
      conflito,
    }),
  );
}

export async function tiposDeVistoLocais(
  banco: BancoLocal,
  fila: BancoDaFila,
): Promise<{
  tipos: Com<Tables<"visa_types">>[];
  etapasPorTipo: Record<string, number>;
  documentosPorTipo: Record<string, number>;
}> {
  const itens = await pendentes(fila);
  const [tipos, etapas, documentos] = await Promise.all([
    ler(banco, "visa_types", itens),
    ler(banco, "visa_stages", itens),
    ler(banco, "visa_type_documents", itens),
  ]);

  return {
    // Mesma ordem do servidor: posição e, empatando, nome.
    tipos: (tipos as Com<Tables<"visa_types">>[]).sort(
      (a, b) => a.position - b.position || a.name.localeCompare(b.name, "pt-BR"),
    ),
    etapasPorTipo: contagemPorVisto(etapas as { visa_type_id: string }[]),
    documentosPorTipo: contagemPorVisto(documentos as { visa_type_id: string }[]),
  };
}

export async function tipoDeVistoLocal(
  banco: BancoLocal,
  fila: BancoDaFila,
  visaId: string,
): Promise<{
  visto: Tables<"visa_types"> | null;
  etapas: EtapaDoVisto[];
  catalogo: PastaDoCatalogo[];
  exigencias: ExigenciaDoVisto[];
}> {
  const itens = await pendentes(fila);
  const [tipos, etapas, catalogo, exigencias] = await Promise.all([
    ler(banco, "visa_types", itens),
    ler(banco, "visa_stages", itens),
    ler(banco, "document_types", itens),
    ler(banco, "visa_type_documents", itens),
  ]);

  return {
    visto: (tipos as Tables<"visa_types">[]).find((v) => v.id === visaId) ?? null,
    etapas: porPosicao(
      (etapas as Com<Tables<"visa_stages">>[]).filter((e) => e.visa_type_id === visaId),
    ).map(
      ({
        id,
        parent_id,
        name,
        position,
        is_required,
        estimated_days,
        pendente,
        conflito,
      }) => ({
        id,
        parent_id,
        name,
        position,
        is_required,
        estimated_days,
        pendente,
        conflito,
      }),
    ),
    catalogo: porPosicao(catalogo as Com<Tables<"document_types">>[]).map(
      ({ id, parent_id, name, position, pendente, conflito }) => ({
        id,
        parent_id,
        name,
        position,
        pendente,
        conflito,
      }),
    ),
    exigencias: (exigencias as Com<Tables<"visa_type_documents">>[])
      .filter((e) => e.visa_type_id === visaId)
      .map(
        ({
          id,
          document_type_id,
          is_required,
          deadline_days,
          position,
          pendente,
          conflito,
        }) => ({
          id,
          document_type_id,
          is_required,
          deadline_days,
          position,
          pendente,
          conflito,
        }),
      ),
  };
}
