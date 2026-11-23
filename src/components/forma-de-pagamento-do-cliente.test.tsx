import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FormaParaOCliente } from "@/lib/forma-do-cliente";

import { FormaDePagamentoDoCliente } from "./forma-de-pagamento-do-cliente";

/**
 * A forma de pagamento desenhada para o cliente — a mesma na prévia do envio e
 * na ficha pública (entrega 4b, §5.4). O que ele lê é o que vai no contrato.
 */

const FORMA: FormaParaOCliente = {
  vistos: [{ visa_name: "EB-2 NIW", amount: 6000, currency: "USD" }],
  partes: [
    {
      label: "Entrada",
      method: "transferencia",
      currency: "USD",
      total: 2100,
      usd_equivalent: null,
      parcelas: [{ number: 1, amount: 2100, due_on: "2026-12-10" }],
    },
    {
      label: "Cartão",
      method: "cartao",
      currency: "BRL",
      total: 21527.76,
      usd_equivalent: 3900,
      parcelas: [{ number: 1, amount: 21527.76, due_on: "2026-12-15" }],
    },
  ],
};

/** O texto da tela com o espaço rígido do Intl trocado por espaço comum. */
const texto = () => (document.body.textContent ?? "").replaceAll(" ", " ");

describe("FormaDePagamentoDoCliente", () => {
  it("mostra os vistos, as partes com o método, a conversão e as datas", () => {
    render(<FormaDePagamentoDoCliente forma={FORMA} />);

    expect(screen.getByText("EB-2 NIW")).toBeTruthy();
    expect(texto()).toContain("US$ 6.000");
    expect(texto()).toContain("Entrada · Transferência");
    expect(texto()).toContain("Cartão · Cartão");
    expect(texto()).toContain("US$ 3.900 convertidos para R$ 21.527,76");
    expect(texto()).toContain("10/12/2026");
    // A data do cartão também aparece (Renato, 23/nov).
    expect(texto()).toContain("15/12/2026");
  });

  it("cada parcela de uma parte parcelada é uma linha, com data e valor", () => {
    const parcelada: FormaParaOCliente = {
      vistos: FORMA.vistos,
      partes: [
        {
          label: "Parcelas",
          method: "boleto",
          currency: "BRL",
          total: 30000,
          usd_equivalent: null,
          parcelas: [
            { number: 1, amount: 10000, due_on: "2026-12-10" },
            { number: 2, amount: 10000, due_on: "2027-01-10" },
            { number: 3, amount: 10000, due_on: "2027-02-10" },
          ],
        },
      ],
    };
    render(<FormaDePagamentoDoCliente forma={parcelada} />);

    const linhas = screen.getAllByRole("listitem").filter((li) => li.textContent?.includes("R$"));
    expect(linhas).toHaveLength(3);
    expect(linhas[1]!.textContent).toContain("10/01/2027");
    expect(linhas[1]!.textContent?.replaceAll(" ", " ")).toContain("R$ 10.000");
  });

  it("nunca fala de cotação", () => {
    render(<FormaDePagamentoDoCliente forma={FORMA} />);
    expect(texto().toLowerCase()).not.toContain("cotação");
  });
});
