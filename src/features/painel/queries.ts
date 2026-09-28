import { createClient } from "@/lib/supabase/server";

/**
 * O que a tela Início precisa para avisar — lido no servidor, com a RLS de
 * quem está logado. Nenhuma consulta filtra por organização, e nenhuma
 * deveria.
 *
 * O erro volta junto, e a tela o mostra. Leitura que falha **não pode** virar
 * "nada vencendo": seria a tela dizendo que está tudo em dia justamente
 * quando não sabe — o pior silêncio que um painel de alertas pode ter.
 *
 * As consultas já trazem só o que pode alertar (parcela em aberto e vencida,
 * etapa com data passada); as regras de `regras.ts` conferem de novo. Filtrar
 * aqui é economia de tráfego, e a regra continua morando num lugar só.
 */

export type DadosDoPainel = {
  processos: {
    id: string;
    title: string;
    cliente: string;
    rfe_due_on: string | null;
    rfe_answered_on: string | null;
    decided_on: string | null;
  }[];
  pastas: {
    project_id: string;
    is_required: boolean;
    resolved_at: string | null;
    deadline_on: string | null;
  }[];
  etapas: { project_id: string; due_on: string | null; concluida: boolean }[];
  parcelas: {
    amount: number;
    currency: string;
    due_on: string;
    paid_on: string | null;
    cliente: string;
    person_id: string;
  }[];
};

export async function lerPainel(
  hoje: string,
): Promise<{ dados: DadosDoPainel | null; error: string | null }> {
  const supabase = await createClient();

  const [processos, status, parcelas] = await Promise.all([
    supabase
      .from("projects")
      .select(
        `id, title, rfe_due_on, rfe_answered_on, decided_on,
         person:people(full_name),
         pastas:project_documents(is_required, resolved_at, deadline_on),
         etapas:project_stages(due_on, status_id)`,
      ),
    supabase.from("stage_statuses").select("id, is_done"),
    supabase
      .from("installments")
      .select(
        `amount, due_on, paid_on,
         cobranca:receivables(currency, person_id, person:people(full_name))`,
      )
      .is("paid_on", null)
      .lt("due_on", hoje),
  ]);

  const falha = processos.error ?? status.error ?? parcelas.error;
  if (falha) return { dados: null, error: falha.message };

  const concluiEtapa = new Map((status.data ?? []).map((s) => [s.id, s.is_done]));

  return {
    error: null,
    dados: {
      processos: (processos.data ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        cliente: p.person?.full_name ?? "Cliente removido",
        rfe_due_on: p.rfe_due_on,
        rfe_answered_on: p.rfe_answered_on,
        decided_on: p.decided_on,
      })),
      pastas: (processos.data ?? []).flatMap((p) =>
        p.pastas.map((pasta) => ({ project_id: p.id, ...pasta })),
      ),
      etapas: (processos.data ?? []).flatMap((p) =>
        p.etapas.map((e) => ({
          project_id: p.id,
          due_on: e.due_on,
          concluida: concluiEtapa.get(e.status_id) ?? false,
        })),
      ),
      parcelas: (parcelas.data ?? []).flatMap((p) =>
        // Parcela sem a cobrança visível não vira alerta sem moeda nem nome.
        p.cobranca
          ? [
              {
                amount: Number(p.amount),
                currency: p.cobranca.currency,
                due_on: p.due_on,
                paid_on: p.paid_on,
                cliente: p.cobranca.person?.full_name ?? "Cliente removido",
                person_id: p.cobranca.person_id,
              },
            ]
          : [],
      ),
    },
  };
}
