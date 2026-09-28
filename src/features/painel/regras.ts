import { diasAte, venceu } from "@/lib/prazos";
import { somarPorMoeda, type PorMoeda } from "@/lib/totals";

export { diasAte };

/**
 * O que a tela Início avisa — puro, testado em `regras.test.ts`.
 *
 * Um alerta mente de dois jeitos: gritando por algo já resolvido, ou calando
 * sobre algo vencido. O primeiro ensina a ignorar a tela; o segundo é pior.
 * Cada regra abaixo existe para fechar um desses dois buracos.
 *
 * "Hoje" é sempre `hojeEmSaoPaulo()`, e o dia do vencimento ainda é do
 * cliente — a regra de `lib/prazos.ts`, a mesma que o Financeiro usa.
 */

/** Prazo de RFE entra no radar com este tanto de antecedência. */
export const DIAS_DE_ANTECEDENCIA_DA_RFE = 30;
/** E fica vermelho a partir daqui. */
export const DIAS_DE_URGENCIA_DA_RFE = 7;

type Processo = {
  id: string;
  title: string;
  cliente: string;
  rfe_due_on: string | null;
  rfe_answered_on: string | null;
  decided_on: string | null;
};

type Pasta = {
  project_id: string;
  is_required: boolean;
  resolved_at: string | null;
  deadline_on: string | null;
};

type Etapa = { project_id: string; due_on: string | null; concluida: boolean };

type Parcela = {
  amount: number;
  currency: string;
  due_on: string;
  paid_on: string | null;
  cliente: string;
  person_id: string;
};

export type Referencia = { id: string; title: string; cliente: string };

export type AlertaDeRfe = Referencia & { prazo: string; dias: number; urgente: boolean };

export type Alertas = {
  rfe: AlertaDeRfe[];
  parcelas: {
    quantidade: number;
    total: PorMoeda;
    clientes: { person_id: string; nome: string; quantidade: number }[];
  };
  pastas: { processo: Referencia; quantidade: number }[];
  etapas: { processo: Referencia; quantidade: number }[];
  vazio: boolean;
};

/** Conta por processo, na ordem de quem tem mais. */
function porProcesso(
  ids: string[],
  processos: Map<string, Referencia>,
): { processo: Referencia; quantidade: number }[] {
  const contagem = new Map<string, number>();
  for (const id of ids) contagem.set(id, (contagem.get(id) ?? 0) + 1);

  return [...contagem]
    .flatMap(([id, quantidade]) => {
      const processo = processos.get(id);
      // Processo que este login não enxerga não vira linha sem nome.
      return processo ? [{ processo, quantidade }] : [];
    })
    .sort((a, b) => b.quantidade - a.quantidade);
}

export function alertasDoDia(
  dados: { processos: Processo[]; pastas: Pasta[]; etapas: Etapa[]; parcelas: Parcela[] },
  hoje: string,
): Alertas {
  const referencias = new Map(
    dados.processos.map((p) => [p.id, { id: p.id, title: p.title, cliente: p.cliente }]),
  );

  // RFE: só a que ainda espera resposta, em processo ainda sem decisão. Sem a
  // data de resposta (0034), o alerta gritaria depois de a resposta sair.
  const rfe = dados.processos
    .filter((p) => p.rfe_due_on && !p.rfe_answered_on && !p.decided_on)
    .map((p) => {
      const dias = diasAte(p.rfe_due_on!, hoje);
      return {
        id: p.id,
        title: p.title,
        cliente: p.cliente,
        prazo: p.rfe_due_on!,
        dias,
        urgente: dias <= DIAS_DE_URGENCIA_DA_RFE,
      };
    })
    .filter((r) => r.dias <= DIAS_DE_ANTECEDENCIA_DA_RFE)
    .sort((a, b) => a.dias - b.dias);

  const vencidas = dados.parcelas.filter((p) => !p.paid_on && venceu(p.due_on, hoje));

  const porCliente = new Map<string, { person_id: string; nome: string; quantidade: number }>();
  for (const p of vencidas) {
    const atual = porCliente.get(p.person_id) ?? {
      person_id: p.person_id,
      nome: p.cliente,
      quantidade: 0,
    };
    atual.quantidade += 1;
    porCliente.set(p.person_id, atual);
  }

  const pastas = porProcesso(
    dados.pastas
      .filter((p) => p.is_required && !p.resolved_at && p.deadline_on && venceu(p.deadline_on, hoje))
      .map((p) => p.project_id),
    referencias,
  );

  const etapas = porProcesso(
    dados.etapas
      .filter((e) => !e.concluida && e.due_on && venceu(e.due_on, hoje))
      .map((e) => e.project_id),
    referencias,
  );

  const parcelas = {
    quantidade: vencidas.length,
    total: somarPorMoeda(vencidas.map((p) => ({ value: p.amount, currency: p.currency }))),
    clientes: [...porCliente.values()].sort((a, b) => b.quantidade - a.quantidade),
  };

  return {
    rfe,
    parcelas,
    pastas,
    etapas,
    vazio:
      rfe.length === 0 &&
      parcelas.quantidade === 0 &&
      pastas.length === 0 &&
      etapas.length === 0,
  };
}
