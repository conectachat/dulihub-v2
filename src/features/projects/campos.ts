import { STATUS_DO_PROCESSO } from "./schema";

/**
 * Validação dos campos do processo editados no lugar, um por vez. Testado em
 * `campos.test.ts`.
 */

const DATAS = [
  "priority_date",
  "filed_on",
  "rfe_received_on",
  "rfe_due_on",
  "decided_on",
  "expected_on",
] as const;

export type CampoDeData = (typeof DATAS)[number];
export type CampoDoProcesso = CampoDeData | "uscis_receipt_number" | "status";

type Resultado =
  | { ok: true; campo: CampoDoProcesso; valor: string | null }
  | { ok: false; erro: string };

/** `AAAA-MM-DD` que existe no calendário — 30 de fevereiro não passa. */
function dataValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d));
  return (
    data.getUTCFullYear() === a &&
    data.getUTCMonth() === m - 1 &&
    data.getUTCDate() === d
  );
}

/**
 * O nome do campo chega do navegador e **não é confiável**: a lista fechada é
 * o que impede um formulário adulterado de gravar `person_id` ou
 * `organization_id` pela mesma porta.
 */
export function campoDoProcesso(campo: string, bruto: string): Resultado {
  const texto = bruto.trim();

  if ((DATAS as readonly string[]).includes(campo)) {
    if (texto === "") return { ok: true, campo: campo as CampoDeData, valor: null };
    if (!dataValida(texto)) return { ok: false, erro: "Data inválida." };
    return { ok: true, campo: campo as CampoDeData, valor: texto };
  }

  if (campo === "uscis_receipt_number") {
    const recibo = texto.replace(/[\s-]/g, "").toUpperCase();
    if (recibo === "") return { ok: true, campo, valor: null };
    if (!/^[A-Z]{3}\d{10}$/.test(recibo)) {
      return {
        ok: false,
        erro: "O recibo do USCIS tem 3 letras e 10 números, como IOE0912345678.",
      };
    }
    return { ok: true, campo, valor: recibo };
  }

  if (campo === "status") {
    if (!(texto in STATUS_DO_PROCESSO)) return { ok: false, erro: "Status inválido." };
    return { ok: true, campo, valor: texto };
  }

  return { ok: false, erro: "Campo não editável." };
}

/**
 * Datas da etapa depois de trocar o status — o Renato troca o status, as datas
 * se ajustam sozinhas.
 *
 * - Status padrão ("pendente") é desfazer: a etapa não começou.
 * - Qualquer outro marca o início, se ainda não havia.
 * - Status de concluída marca a conclusão; sair dele a apaga.
 */
export function datasDaEtapa(
  status: { is_default: boolean; is_done: boolean },
  atual: { started_on: string | null; completed_on: string | null },
  hoje: string,
): { started_on: string | null; completed_on: string | null } {
  if (status.is_default) return { started_on: null, completed_on: null };

  return {
    started_on: atual.started_on ?? hoje,
    completed_on: status.is_done ? (atual.completed_on ?? hoje) : null,
  };
}

// -------------------------------------------------------------------- etapa

type ResultadoDaEtapa =
  | { ok: true; campo: "due_on" | "completed_on" | "name"; valor: string | null }
  | { ok: false; erro: string };

/**
 * Um campo da etapa, editado no lugar. Mesma lista fechada de
 * `campoDoProcesso`: o nome vem do navegador.
 *
 * A conclusão só se corrige, não se apaga: apagar é reabrir a etapa, e isso
 * se faz trocando o status — senão ficaria "Concluída" sem data.
 */
export function campoDaEtapa(campo: string, bruto: string): ResultadoDaEtapa {
  const texto = bruto.trim();

  if (campo === "due_on") {
    if (texto === "") return { ok: true, campo, valor: null };
    if (!dataValida(texto)) return { ok: false, erro: "Data inválida." };
    return { ok: true, campo, valor: texto };
  }

  if (campo === "completed_on") {
    if (texto === "") {
      return {
        ok: false,
        erro: "Para tirar a conclusão, troque o status da etapa.",
      };
    }
    if (!dataValida(texto)) return { ok: false, erro: "Data inválida." };
    return { ok: true, campo, valor: texto };
  }

  if (campo === "name") {
    if (texto === "") return { ok: false, erro: "Informe o nome da etapa." };
    return { ok: true, campo, valor: texto };
  }

  return { ok: false, erro: "Campo não editável." };
}

/**
 * Número de cada etapa como índice de livro — 1, 1.1, 1.2, 2 —, na ordem em
 * que `flattenTree` entrega a árvore.
 */
export function numeracao(
  arvore: { id: string; depth: number }[],
): Map<string, string> {
  const contadores: number[] = [];
  const saida = new Map<string, string>();
  for (const { id, depth } of arvore) {
    contadores.length = depth + 1;
    contadores[depth] = (contadores[depth] ?? 0) + 1;
    saida.set(id, contadores.slice(0, depth + 1).join("."));
  }
  return saida;
}

/** Filhas diretas concluídas de cada mãe — o "2/3" ao lado do nome. */
export function resumoDasFilhas(
  etapas: { id: string; parent_id: string | null; status_id: string }[],
  statusConcluidos: Set<string>,
): Map<string, { concluidas: number; total: number }> {
  const resumo = new Map<string, { concluidas: number; total: number }>();
  for (const e of etapas) {
    if (e.parent_id === null) continue;
    const r = resumo.get(e.parent_id) ?? { concluidas: 0, total: 0 };
    r.total += 1;
    if (statusConcluidos.has(e.status_id)) r.concluidas += 1;
    resumo.set(e.parent_id, r);
  }
  return resumo;
}
