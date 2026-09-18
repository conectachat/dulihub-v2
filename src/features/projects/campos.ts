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
