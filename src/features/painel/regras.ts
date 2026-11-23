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

type Ficha = {
  person_id: string;
  cliente: string;
  /** O estágio da pessoa: decide se o link vai ao perfil de cliente. */
  estagio: string;
  submitted_at: string | null;
  reviewed_at: string | null;
};

/**
 * A forma de pagamento de um negócio aberto, como a Início lê (entrega 4b,
 * INI-8): o estado, as respostas e os links da ficha com ela.
 */
export type FormaDoPainel = {
  negocio_id: string;
  nome: string;
  status: "rascunho" | "enviada" | "recusada" | "confirmada";
  charges_created_at: string | null;
  respostas: {
    decision: "confirmada" | "recusada" | "confirmada_pela_equipe";
    reason: string | null;
    answered_at: string;
    created_at: string;
  }[];
  links: { expires_at: string; closed_at: string | null; cancelled_at: string | null; created_at: string }[];
};

export type AlertaDeForma = { negocio_id: string; nome: string };

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
  /** Ficha de cadastro que o cliente preencheu e ninguém conferiu ainda. */
  fichas: { person_id: string; nome: string; estagio: string; recebidaEm: string }[];
  /** A forma de pagamento que espera a equipe (INI-8). */
  formas: {
    recusadas: (AlertaDeForma & { motivo: string | null })[];
    prontas: AlertaDeForma[];
    vencidas: AlertaDeForma[];
  };
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

/**
 * Os três avisos da forma de pagamento (entrega 4b, §5.6 do desenho), só de
 * negócios abertos — a consulta já filtra:
 *
 * - recusada: a última resposta é a recusa do cliente, e a forma está
 *   recusada ou em rascunho. Fica depois do Ajustar de propósito: quem só
 *   ajustou ainda não reenviou nada. Some no reenvio ou na confirmação;
 * - pronto para o contrato: confirmada, sem as cobranças do Ganho;
 * - link vencido sem resposta: enviada, e o link aberto passou do prazo.
 *   `agora` é um instante, e não o dia: o link vence no meio do dia (P18).
 */
function alertasDaForma(formas: FormaDoPainel[], agora: Date): Alertas["formas"] {
  const recusadas: Alertas["formas"]["recusadas"] = [];
  const prontas: AlertaDeForma[] = [];
  const vencidas: AlertaDeForma[] = [];

  for (const f of formas) {
    const quem = { negocio_id: f.negocio_id, nome: f.nome };
    const [ultima] = [...f.respostas].sort(
      (a, b) => b.answered_at.localeCompare(a.answered_at) || b.created_at.localeCompare(a.created_at),
    );

    if (ultima?.decision === "recusada" && (f.status === "recusada" || f.status === "rascunho")) {
      recusadas.push({ ...quem, motivo: ultima.reason });
    }
    if (f.status === "confirmada" && !f.charges_created_at) prontas.push(quem);
    if (f.status === "enviada") {
      const [aberto] = f.links
        .filter((l) => l.closed_at === null && l.cancelled_at === null)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (!aberto || new Date(aberto.expires_at).getTime() <= agora.getTime()) vencidas.push(quem);
    }
  }

  return { recusadas, prontas, vencidas };
}

export function alertasDoDia(
  dados: {
    processos: Processo[];
    pastas: Pasta[];
    etapas: Etapa[];
    parcelas: Parcela[];
    fichas: Ficha[];
    formas?: FormaDoPainel[];
  },
  hoje: string,
  agora: Date = new Date(),
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

  // Ficha recebida fica no aviso até alguém clicar "Conferi" — é o próximo
  // passo do contrato, e sem o aviso ela chegaria sem ninguém saber. A mais
  // antiga primeiro: é a que espera há mais tempo.
  // Uma linha por pessoa, a da ficha mais recente sem conferir: o Conferi
  // confere ela e as anteriores juntas (revisão final da 4b).
  const porPessoa = new Map<string, Alertas["fichas"][number]>();
  for (const f of dados.fichas) {
    if (!f.submitted_at || f.reviewed_at) continue;
    const atual = porPessoa.get(f.person_id);
    if (atual && atual.recebidaEm >= f.submitted_at) continue;
    porPessoa.set(f.person_id, {
      person_id: f.person_id,
      nome: f.cliente,
      estagio: f.estagio,
      recebidaEm: f.submitted_at,
    });
  }
  const fichas = [...porPessoa.values()].sort((a, b) => a.recebidaEm.localeCompare(b.recebidaEm));

  const formas = alertasDaForma(dados.formas ?? [], agora);

  return {
    rfe,
    parcelas,
    pastas,
    etapas,
    fichas,
    formas,
    vazio:
      rfe.length === 0 &&
      parcelas.quantidade === 0 &&
      pastas.length === 0 &&
      etapas.length === 0 &&
      fichas.length === 0 &&
      formas.recusadas.length === 0 &&
      formas.prontas.length === 0 &&
      formas.vencidas.length === 0,
  };
}
