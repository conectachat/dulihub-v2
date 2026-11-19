import { describe, expect, it } from "vitest";

import {
  emCentavos,
  emMoeda,
  formatarMoeda,
  formatarPorMoeda,
  somarItensPorMoeda,
  somarPorMoeda,
} from "./totals";

/**
 * O CRM somava valores sem olhar a moeda e escrevia R$ no resultado. Um
 * EB-2 NIW de US$ 12.000 ao lado de um negócio de R$ 8.000 virava
 * "R$ 20.000 em negociação" — um número que não existe.
 */

describe("somarPorMoeda", () => {
  it("mantém as moedas separadas", () => {
    const total = somarPorMoeda([
      { value: 12000, currency: "USD" },
      { value: 8000, currency: "BRL" },
      { value: 500, currency: "USD" },
    ]);
    expect(total).toEqual({ USD: 12500, BRL: 8000 });
  });

  it("ignora negócio sem valor", () => {
    const total = somarPorMoeda([
      { value: null, currency: "BRL" },
      { value: 100, currency: "BRL" },
    ]);
    expect(total).toEqual({ BRL: 100 });
  });

  it("devolve vazio quando não há nada a somar", () => {
    expect(somarPorMoeda([])).toEqual({});
  });
});

describe("formatarMoeda", () => {
  it("mostra centavos só quando existem", () => {
    // As duas cópias antigas divergiam: o quadro mostrava "R$ 12.500" e a
    // ficha "R$ 12.500,00" para o mesmo registro.
    expect(formatarMoeda(12500, "BRL")).toContain("12.500");
    expect(formatarMoeda(12500, "BRL")).not.toContain(",00");
    expect(formatarMoeda(12500.5, "BRL")).toContain(",50");
  });

  it("respeita a moeda pedida", () => {
    expect(formatarMoeda(2000, "USD")).toContain("US$");
    expect(formatarMoeda(2000, "BRL")).toContain("R$");
  });
});

describe("formatarPorMoeda", () => {
  it("lista as duas moedas em vez de somar uma na outra", () => {
    const texto = formatarPorMoeda({ USD: 12000, BRL: 8000 });
    expect(texto).toContain("R$");
    expect(texto).toContain("US$");
    expect(texto).toContain(" e ");
  });

  it("com uma moeda só, não inventa conjunção", () => {
    expect(formatarPorMoeda({ BRL: 8000 })).not.toContain(" e ");
  });

  it("devolve vazio quando não há valor", () => {
    expect(formatarPorMoeda({})).toBe("");
    expect(formatarPorMoeda({ BRL: 0 })).toBe("");
  });
});

describe("somarItensPorMoeda", () => {
  it("soma em centavos: 0,1 + 0,2 dá 0,3", () => {
    expect(
      somarItensPorMoeda([
        { amount: 0.1, currency: "BRL" },
        { amount: 0.2, currency: "BRL" },
      ]),
    ).toEqual({ BRL: 0.3 });
  });

  it("nunca soma uma moeda na outra", () => {
    expect(
      somarItensPorMoeda([
        { amount: 8000, currency: "USD" },
        { amount: 6000, currency: "USD" },
        { amount: 1000, currency: "BRL" },
      ]),
    ).toEqual({ USD: 14000, BRL: 1000 });
  });

  it("a moeda com total zero aparece", () => {
    expect(somarItensPorMoeda([{ amount: 0, currency: "USD" }])).toEqual({ USD: 0 });
  });
});

describe("emCentavos e emMoeda", () => {
  it("vão e voltam sem perder o troco", () => {
    expect(emCentavos(10.05)).toBe(1005);
    expect(emMoeda(1005)).toBe(10.05);
  });
});
