// @vitest-environment node

import { describe, expect, it } from "vitest";

import { gerarParcelas, somarMeses } from "./parcelas";

/**
 * Parcelas mês a mês, sem perder centavo — usadas pela cobrança do Financeiro
 * e pela forma de pagamento do negócio (entrega 4a).
 */

describe("somarMeses", () => {
  it("anda os meses mantendo o dia", () => {
    expect(somarMeses("2026-01-10", 1)).toBe("2026-02-10");
    expect(somarMeses("2026-01-10", 11)).toBe("2026-12-10");
  });

  it("vira o ano", () => {
    expect(somarMeses("2026-11-05", 3)).toBe("2027-02-05");
  });

  it("dia 31 em mês curto cai no último dia, não pula para o mês seguinte", () => {
    // O jeito ingênuo (`setMonth`) transforma 31 de janeiro em 3 de março, e
    // a parcela de fevereiro simplesmente deixa de existir.
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2026-01-31", 3)).toBe("2026-04-30");
  });

  it("fevereiro de ano bissexto", () => {
    expect(somarMeses("2028-01-31", 1)).toBe("2028-02-29");
  });
});

describe("gerarParcelas", () => {
  it("uma parcela é o valor inteiro, no primeiro vencimento", () => {
    const p = gerarParcelas({ total: 5000, quantidade: 1, primeiroVencimento: "2026-10-05" });

    expect(p).toEqual([{ number: 1, amount: 5000, due_on: "2026-10-05" }]);
  });

  it("divide igual e vence de mês em mês", () => {
    const p = gerarParcelas({ total: 3000, quantidade: 3, primeiroVencimento: "2026-10-05" });

    expect(p.map((x) => x.amount)).toEqual([1000, 1000, 1000]);
    expect(p.map((x) => x.due_on)).toEqual(["2026-10-05", "2026-11-05", "2026-12-05"]);
  });

  it("a sobra de centavos vai na primeira, e a soma fecha exata", () => {
    // 1000 / 3 dá 333,33 três vezes = 999,99. O app antigo conferia isso na
    // tela com tolerância de dois centavos; aqui fecha por construção.
    const p = gerarParcelas({ total: 1000, quantidade: 3, primeiroVencimento: "2026-10-05" });

    expect(p.map((x) => x.amount)).toEqual([333.34, 333.33, 333.33]);
    expect(p.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(1000, 2);
  });

  it("entrada maior, resto dividido igual", () => {
    const p = gerarParcelas({
      total: 12000,
      quantidade: 4,
      primeiroVencimento: "2026-10-05",
      entrada: 6000,
    });

    expect(p.map((x) => x.amount)).toEqual([6000, 2000, 2000, 2000]);
    expect(p.reduce((s, x) => s + x.amount, 0)).toBe(12000);
  });

  it("entrada que não divide redondo também fecha exata", () => {
    const p = gerarParcelas({
      total: 1000,
      quantidade: 4,
      primeiroVencimento: "2026-10-05",
      entrada: 500,
    });

    expect(p[0].amount).toBe(500);
    expect(p.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(1000, 2);
  });

  it("entrada igual ao total deixa as outras zeradas? não: recusa", () => {
    // Entrada que não deixa nada para as demais é erro de digitação, e gerar
    // parcelas de zero esconderia isso até a hora da cobrança.
    expect(() =>
      gerarParcelas({
        total: 1000,
        quantidade: 3,
        primeiroVencimento: "2026-10-05",
        entrada: 1000,
      }),
    ).toThrow();
  });

  it("quantidade inválida é recusada", () => {
    expect(() =>
      gerarParcelas({ total: 100, quantidade: 0, primeiroVencimento: "2026-10-05" }),
    ).toThrow();
  });
});
