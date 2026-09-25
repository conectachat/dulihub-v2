// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  emReais,
  recebidoNoMes,
  gerarParcelas,
  resumoDoRecebivel,
  situacaoDaParcela,
  somarMeses,
} from "./regras";

/**
 * As contas do a receber, sem banco e sem tela.
 *
 * Cada uma existe por causa de um jeito conhecido de o dinheiro sair errado:
 * centavo que some no arredondamento, vencimento que pula de mês, cotação
 * chutada, e a soma de dólar com real.
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

describe("situacaoDaParcela", () => {
  const HOJE = "2026-10-15";

  it("paga é paga, mesmo vencida", () => {
    expect(
      situacaoDaParcela({ due_on: "2026-09-01", paid_on: "2026-09-03" }, HOJE),
    ).toBe("paga");
  });

  it("não paga com vencimento passado está vencida", () => {
    expect(situacaoDaParcela({ due_on: "2026-10-14", paid_on: null }, HOJE)).toBe("vencida");
  });

  it("vence hoje ainda não está vencida", () => {
    // O dia do vencimento é do cliente. Chamar de vencida às 00h01 é cobrar
    // uma dívida que ainda não existe.
    expect(situacaoDaParcela({ due_on: HOJE, paid_on: null }, HOJE)).toBe("pendente");
  });

  it("vencimento futuro está pendente", () => {
    expect(situacaoDaParcela({ due_on: "2026-11-01", paid_on: null }, HOJE)).toBe("pendente");
  });
});

describe("emReais", () => {
  it("em real, é o próprio valor", () => {
    expect(emReais(1500, "BRL", null)).toBe(1500);
  });

  it("em dólar, multiplica pela cotação daquele dia", () => {
    expect(emReais(1000, "USD", 5.5)).toBe(5500);
  });

  it("dólar sem cotação devolve nulo, e não o número cru", () => {
    // Sem cotação não há conversão possível. Devolver 1000 poria mil reais
    // no caixa onde entraram mil dólares.
    expect(emReais(1000, "USD", null)).toBeNull();
    expect(emReais(1000, "USD", 0)).toBeNull();
  });

  it("arredonda para centavo", () => {
    expect(emReais(100, "USD", 5.4321)).toBe(543.21);
  });
});

describe("resumoDoRecebivel", () => {
  const HOJE = "2026-10-15";

  it("separa pago, em aberto e vencido", () => {
    const r = resumoDoRecebivel(
      [
        { amount: 1000, due_on: "2026-09-10", paid_on: "2026-09-10" },
        { amount: 1000, due_on: "2026-10-10", paid_on: null },
        { amount: 1000, due_on: "2026-11-10", paid_on: null },
      ],
      HOJE,
    );

    expect(r).toEqual({
      total: 3000,
      pago: 1000,
      aberto: 2000,
      vencido: 1000,
      parcelas: 3,
      pagas: 1,
    });
  });

  it("tudo pago não deixa nada em aberto", () => {
    const r = resumoDoRecebivel(
      [{ amount: 500, due_on: "2026-09-10", paid_on: "2026-09-11" }],
      HOJE,
    );

    expect(r.aberto).toBe(0);
    expect(r.vencido).toBe(0);
  });

  it("sem parcela nenhuma, tudo zero — e não NaN", () => {
    expect(resumoDoRecebivel([], HOJE)).toEqual({
      total: 0,
      pago: 0,
      aberto: 0,
      vencido: 0,
      parcelas: 0,
      pagas: 0,
    });
  });
});

describe("recebidoNoMes", () => {
  const parcelas = [
    { amount: 1000, paid_on: "2026-10-03", paid_rate: 5.4, currency: "USD" },
    { amount: 2000, paid_on: "2026-10-28", paid_rate: null, currency: "BRL" },
    { amount: 500, paid_on: "2026-09-30", paid_rate: null, currency: "BRL" },
    { amount: 300, paid_on: null, paid_rate: null, currency: "BRL" },
  ];

  it("soma só o que entrou no mês, convertendo pela cotação de cada um", () => {
    expect(recebidoNoMes(parcelas, "2026-10")).toEqual({ total: 7400, semCotacao: 0 });
  });

  it("conta pela data do pagamento, não pela do vencimento", () => {
    expect(recebidoNoMes(parcelas, "2026-09")).toEqual({ total: 500, semCotacao: 0 });
  });

  it("dólar sem cotação fica de fora e é contado à parte", () => {
    // Somar mil dólares como se fossem mil reais é pior do que a tela dizer
    // que há uma parcela sem cotação.
    const r = recebidoNoMes(
      [{ amount: 1000, paid_on: "2026-10-03", paid_rate: null, currency: "USD" }],
      "2026-10",
    );

    expect(r).toEqual({ total: 0, semCotacao: 1 });
  });
});
