import { createClient } from "@/lib/supabase/server";

import { progresso } from "./regras";
import { proximoPrazo } from "./schema";

/**
 * Leituras de processo. Toda a separação por organização é da RLS; nenhuma
 * consulta aqui filtra por organização, e nenhuma deveria.
 *
 * Cada função devolve o erro junto: leitura que falha não pode virar lista
 * vazia, senão "caiu" e "não tem processo" ficam iguais na tela.
 */

const COLUNAS = `id, title, status, started_on, opportunity_id,
  person:people(id, full_name),
  visto:visa_types(name),
  pastas:project_documents(is_required, resolved_at, deadline_on)`;

type Linha = {
  id: string;
  title: string;
  status: string;
  started_on: string;
  opportunity_id: string | null;
  person: { id: string; full_name: string } | null;
  visto: { name: string } | null;
  pastas: {
    is_required: boolean;
    resolved_at: string | null;
    deadline_on: string | null;
  }[];
};

export type ResumoDoProcesso = Omit<Linha, "pastas"> & {
  progresso: ReturnType<typeof progresso>;
  proximoPrazo: string | null;
};

function resumir<T extends Linha>({
  pastas,
  ...resto
}: T): Omit<T, "pastas"> & Omit<ResumoDoProcesso, keyof Linha> {
  return {
    ...resto,
    progresso: progresso(pastas),
    proximoPrazo: proximoPrazo(pastas),
  };
}

export async function listarProcessos() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(COLUNAS)
    .order("created_at", { ascending: false });

  return {
    processos: (data ?? []).map(resumir),
    error: error?.message ?? null,
  };
}

export async function processosDoContato(personId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(COLUNAS)
    .eq("person_id", personId)
    .order("created_at", { ascending: false });

  return {
    processos: (data ?? []).map(resumir),
    error: error?.message ?? null,
  };
}

/** Tipos de visto ativos, para o seletor do novo processo. */
export async function vistosParaProcesso() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("visa_types")
    .select("id, name")
    .eq("is_active", true)
    .order("position");

  return { vistos: data ?? [], error: error?.message ?? null };
}

/**
 * Um processo inteiro, para a tela dele: cabeçalho, campos do USCIS, etapas e
 * os status de etapa da organização. Processo nulo quando a RLS esconde.
 */
export async function obterProcesso(id: string) {
  const supabase = await createClient();

  const [processo, etapas, status] = await Promise.all([
    supabase
      .from("projects")
      .select(
        `${COLUNAS}, organization_id, uscis_receipt_number, priority_date, filed_on,
         rfe_received_on, rfe_due_on, decided_on, expected_on`,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("project_stages")
      .select(
        "id, parent_id, position, name, is_required, estimated_days, status_id, started_on, completed_on, due_on, source_stage_id",
      )
      .eq("project_id", id),
    // Filtrado abaixo pela organização do processo: quem pertence a duas
    // organizações veria os status das duas no seletor, e escolher um da
    // outra seria recusado pela chave composta.
    supabase
      .from("stage_statuses")
      .select("id, label, color, is_default, is_done, organization_id")
      .order("position"),
  ]);

  return {
    processo: processo.data ? resumir(processo.data) : null,
    etapas: etapas.data ?? [],
    status: (status.data ?? []).filter(
      (s) => s.organization_id === processo.data?.organization_id,
    ),
    error:
      processo.error?.message ??
      etapas.error?.message ??
      status.error?.message ??
      null,
  };
}
