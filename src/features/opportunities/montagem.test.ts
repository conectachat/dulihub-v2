import { describe, expect, it } from "vitest";

import { formaDoNegocio } from "./montagem";

/**
 * A forma de pagamento como o lead a lê (entrega 4a). O PostgREST a devolve
 * em **lista** — o único de `payment_plans` é só `(opportunity_id)` e a chave
 * para o negócio é composta —, com as partes e as parcelas na ordem que vier.
 * A leitura põe em ordem, escolhe a última resposta e estreita método e moeda
 * por esquema, sem `as`.
 */

const parcela = (number: number, amount: number, due_on: string) => ({ number, amount, due_on });

const linha = {
  id: "plano-1",
  status: "confirmada",
  reference_rate: 5.425,
  reference_rate_note: "C6, 21/nov",
  charges_created_at: null,
  partes: [
    {
      position: 1,
      label: "Parcelas",
      method: "transferencia",
      currency: "USD",
      total: 9000,
      installments_count: 3,
      parcelas: [
        parcela(3, 3000, "2027-02-10"),
        parcela(1, 3000, "2026-12-10"),
        parcela(2, 3000, "2027-01-10"),
      ],
    },
    {
      position: 0,
      label: "Entrada",
      method: "pix",
      currency: "BRL",
      total: 10000,
      installments_count: 1,
      parcelas: [parcela(1, 10000, "2026-11-25")],
    },
  ],
  respostas: [
    {
      answered_at: "2026-11-20T12:00:00Z",
      created_at: "2026-11-20T12:00:00Z",
      answered_by_name: "Ana",
      reason: null,
    },
    {
      answered_at: "2026-11-21T15:00:00Z",
      created_at: "2026-11-21T15:00:00Z",
      answered_by_name: "Bruno",
      reason: "Cliente pediu entrada no pix",
    },
  ],
};

describe("formaDoNegocio", () => {
  it("lista vazia: o negócio não tem forma", () => {
    expect(formaDoNegocio([])).toEqual({ forma: null, error: null });
  });

  it("lista de 1: a forma, com as partes por posição e as parcelas por número", () => {
    const { forma, error } = formaDoNegocio([linha]);

    expect(error).toBeNull();
    expect(forma).toMatchObject({
      id: "plano-1",
      status: "confirmada",
      reference_rate: 5.425,
      reference_rate_note: "C6, 21/nov",
      charges_created_at: null,
    });
    expect(forma!.partes.map((p) => p.label)).toEqual(["Entrada", "Parcelas"]);
    expect(forma!.partes[1]!.parcelas.map((p) => p.number)).toEqual([1, 2, 3]);
    expect(forma!.partes[0]).toEqual({
      label: "Entrada",
      method: "pix",
      currency: "BRL",
      total: 10000,
      installments_count: 1,
      // Linha sem a coluna (antes da 0064): sem conversão.
      usd_equivalent: null,
      parcelas: [parcela(1, 10000, "2026-11-25")],
    });
  });

  it("a última resposta é a de maior answered_at", () => {
    const { forma } = formaDoNegocio([linha]);

    expect(forma!.ultimaResposta).toEqual({
      answered_at: "2026-11-21T15:00:00Z",
      answered_by_name: "Bruno",
      reason: "Cliente pediu entrada no pix",
    });
  });

  it("sem resposta, ultimaResposta é nula", () => {
    const { forma } = formaDoNegocio([{ ...linha, status: "rascunho", respostas: [] }]);

    expect(forma!.ultimaResposta).toBeNull();
  });

  it("método fora da lista vira erro, não parte inventada", () => {
    const estranha = { ...linha, partes: [{ ...linha.partes[0]!, method: "cheque" }] };

    expect(formaDoNegocio([estranha])).toEqual({
      forma: null,
      error: "O servidor respondeu num formato inesperado.",
    });
  });
});
