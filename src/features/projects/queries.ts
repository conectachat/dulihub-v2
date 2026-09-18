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

function resumir({ pastas, ...resto }: Linha): ResumoDoProcesso {
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

/** Um processo, para o cabeçalho da tela dele. Nulo quando a RLS esconde. */
export async function obterProcesso(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(COLUNAS)
    .eq("id", id)
    .maybeSingle();

  return {
    processo: data ? resumir(data) : null,
    error: error?.message ?? null,
  };
}
