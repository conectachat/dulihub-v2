// @vitest-environment node

import { describe, expect, it } from "vitest";

import { formatarMoeda } from "@/lib/totals";

import {
  formaParaOCliente,
  formaParaOClienteSchema,
  valorComConversao,
  type ParteParaOCliente,
} from "./forma-do-cliente";

/**
 * A forma de pagamento como o cliente a vê (entrega 4b): na ficha pública e na
 * prévia do envio. O que ele lê é o que vai no contrato, e o que a prova
 * guarda — por isso o formato é um só, o de `private.copia_da_forma`.
 */

const CARTAO: ParteParaOCliente = {
  label: "Cartão",
  method: "cartao",
  currency: "BRL",
  total: 21527.76,
  usd_equivalent: 3900,
  parcelas: [{ number: 1, amount: 21527.76, due_on: "2026-12-15" }],
};

describe("valorComConversao", () => {
  it("a parte em reais diz de quantos dólares veio (FIC-13)", () => {
    expect(valorComConversao(21527.76, "BRL", 3900)).toBe(
      `${formatarMoeda(3900, "USD")} convertidos para ${formatarMoeda(21527.76, "BRL")}`,
    );
    // O Intl põe espaço rígido depois do símbolo.
    expect(valorComConversao(21527.76, "BRL", 3900).replaceAll(" ", " ")).toBe(
      "US$ 3.900 convertidos para R$ 21.527,76",
    );
  });

  it("sem conversão, é o valor na moeda da parte", () => {
    expect(valorComConversao(2100, "USD", null)).toBe(formatarMoeda(2100, "USD"));
  });
});

describe("formaParaOClienteSchema", () => {
  const copia = {
    vistos: [{ visa_name: "EB-2 NIW", amount: 6000, currency: "USD" }],
    partes: [{ ...CARTAO, id: "p1", installments_count: 1 }],
  };

  it("lê a cópia do banco, ignorando o que sobra", () => {
    const lido = formaParaOClienteSchema.safeParse(copia);
    expect(lido.success).toBe(true);
    expect(lido.data?.partes[0]).toEqual(CARTAO);
  });

  it("sem as partes, falha", () => {
    expect(formaParaOClienteSchema.safeParse({ vistos: copia.vistos }).success).toBe(false);
  });

  it("cópia antiga, sem a conversão, lê como sem conversão", () => {
    const antiga = { label: "Cartão", method: "cartao", currency: "BRL", total: 21527.76, parcelas: CARTAO.parcelas };
    const lido = formaParaOClienteSchema.parse({ vistos: [], partes: [antiga] });
    expect(lido.partes[0]!.usd_equivalent).toBeNull();
  });
});

describe("formaParaOCliente", () => {
  it("monta a prévia no mesmo formato da cópia, só com o que o cliente vê", () => {
    const forma = formaParaOCliente(
      [{ visa_name: "EB-2 NIW", amount: 6000, currency: "USD" }],
      [{ ...CARTAO, installments_count: 1 } as ParteParaOCliente],
    );
    expect(forma).toEqual({
      vistos: [{ visa_name: "EB-2 NIW", amount: 6000, currency: "USD" }],
      partes: [CARTAO],
    });
  });
});
