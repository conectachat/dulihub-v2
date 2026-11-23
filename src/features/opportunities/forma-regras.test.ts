// @vitest-environment node

import { describe, expect, it } from "vitest";

import { formatarMoeda } from "@/lib/totals";

import {
  avisoDeCoerencia,
  avisoDeVencidas,
  avisosDoResumo,
  comParcelasGeradas,
  erroDaForma,
  erroDaParte,
  linhaDaParte,
  moedaSugerida,
  parteSugerida,
  totalDaForma,
  totaisDaForma,
  type ParteDaForma,
} from "./forma-regras";
import type { ResumoDoGanho } from "./schema";

/**
 * A forma de pagamento do negócio (entrega 4a), sem banco e sem tela.
 *
 * As frases são as da tabela do plano: a tela e o banco conferem na mesma
 * ordem, e a tela dá a primeira falha de cada parte.
 */

const BASE = "2026-12-10";

/** A parte "Parcelas" do critério: US$ 9.000 em 3 × 3.000 a partir de 10/12. */
function parcelas(extra: Partial<ParteDaForma> = {}): ParteDaForma {
  return {
    label: "Parcelas",
    method: "transferencia",
    currency: "USD",
    total: 9000,
    installments_count: 3,
    usd_equivalent: null,
    parcelas: [
      { number: 1, amount: 3000, due_on: "2026-12-10" },
      { number: 2, amount: 3000, due_on: "2027-01-10" },
      { number: 3, amount: 3000, due_on: "2027-02-10" },
    ],
    ...extra,
  };
}

describe("parteSugerida", () => {
  it("cada botão preenche rótulo, método e número de parcelas (P10)", () => {
    const p = parteSugerida("parcelas", "USD", BASE);
    expect(p).toMatchObject({ label: "Parcelas", method: "transferencia", currency: "USD", installments_count: 3, total: 0 });
    expect(p.parcelas).toHaveLength(3);

    expect(parteSugerida("cartao", "BRL", BASE)).toMatchObject({ label: "Cartão", method: "cartao", installments_count: 1 });
    expect(parteSugerida("entrada", "BRL", BASE)).toMatchObject({ label: "Entrada", method: "pix", installments_count: 1 });
    expect(parteSugerida("a_vista", "BRL", BASE)).toMatchObject({ label: "À vista", method: "pix", installments_count: 1 });
  });

  it("nasce sem conversão (FIC-13)", () => {
    expect(parteSugerida("cartao", "BRL", BASE).usd_equivalent).toBeNull();
  });
});

describe("moedaSugerida", () => {
  it("a dos vistos quando são todos da mesma; senão BRL", () => {
    expect(moedaSugerida([{ currency: "USD" }, { currency: "USD" }])).toBe("USD");
    expect(moedaSugerida([{ currency: "USD" }, { currency: "BRL" }])).toBe("BRL");
    expect(moedaSugerida([])).toBe("BRL");
  });
});

describe("comParcelasGeradas", () => {
  it("divide o total mês a mês a partir da 1ª data", () => {
    const p = comParcelasGeradas(parcelas({ parcelas: [] }), BASE);
    expect(p.parcelas).toEqual([
      { number: 1, amount: 3000, due_on: "2026-12-10" },
      { number: 2, amount: 3000, due_on: "2027-01-10" },
      { number: 3, amount: 3000, due_on: "2027-02-10" },
    ]);
  });

  it("no cartão, sempre 1 parcela com o total, mesmo vindo de Parcelas com 3", () => {
    const p = comParcelasGeradas(parcelas({ method: "cartao" }), BASE);
    expect(p.installments_count).toBe(1);
    expect(p.parcelas).toEqual([{ number: 1, amount: 9000, due_on: BASE }]);
  });

  it("nunca lança: número fora de 1..36, NaN ou data vazia dão parcelas vazias (foco 2)", () => {
    for (const installments_count of [0, Number.NaN, 37]) {
      expect(comParcelasGeradas(parcelas({ installments_count }), BASE).parcelas).toEqual([]);
    }
    expect(comParcelasGeradas(parcelas(), "").parcelas).toEqual([]);
    expect(comParcelasGeradas(parcelas({ total: Number.NaN }), BASE).parcelas).toEqual([]);
  });
});

describe("erroDaParte", () => {
  it("a parte válida não tem erro", () => {
    expect(erroDaParte(parcelas())).toBeNull();
  });

  it("um centavo a menos dá a frase com os dois valores (foco 1)", () => {
    const p = parcelas();
    p.parcelas[2] = { ...p.parcelas[2]!, amount: 2999.99 };
    expect(erroDaParte(p)).toBe(
      "As parcelas de Parcelas somam " +
        formatarMoeda(8999.99, "USD") +
        "; o total é " +
        formatarMoeda(9000, "USD") +
        ".",
    );
  });

  it("lista curta dá só a frase da lista, sem a da soma", () => {
    const p = parcelas();
    p.parcelas = p.parcelas.slice(0, 2);
    expect(erroDaParte(p)).toBe("O número de parcelas de Parcelas não bate com a lista.");
  });

  it("numeração fora de 1..N dá a frase da lista", () => {
    const p = parcelas();
    p.parcelas[2] = { ...p.parcelas[2]!, number: 4 };
    expect(erroDaParte(p)).toBe("O número de parcelas de Parcelas não bate com a lista.");
  });

  it("os limites, cada um com a sua frase", () => {
    expect(erroDaParte(parcelas({ installments_count: 37 }))).toBe("Parcelas vão de 1 a 36.");
    expect(erroDaParte(parcelas({ method: "cartao", installments_count: 2 }))).toBe(
      "Cartão é um pagamento só, numa data.",
    );
    expect(erroDaParte(parcelas({ label: "" }))).toBe("Dê um nome à parte, com até 80 caracteres.");
    expect(erroDaParte(parcelas({ label: "x".repeat(81) }))).toBe(
      "Dê um nome à parte, com até 80 caracteres.",
    );
    expect(erroDaParte(parcelas({ total: 0 }))).toBe("Informe o valor de Parcelas.");
    expect(erroDaParte(parcelas({ total: 10_000_000_000 }))).toBe("O valor de Parcelas passa do limite.");
    expect(erroDaParte(parcelas({ total: 9000.005 }))).toBe("Use no máximo 2 casas decimais em Parcelas.");
  });

  it("2999,99 tem 2 casas (o ponto flutuante não engana)", () => {
    const p = parcelas({
      total: 8999.99,
      parcelas: [
        { number: 1, amount: 3000, due_on: "2026-12-10" },
        { number: 2, amount: 3000, due_on: "2027-01-10" },
        { number: 3, amount: 2999.99, due_on: "2027-02-10" },
      ],
    });
    expect(erroDaParte(p)).toBeNull();
  });

  it("parcela sem valor, com 3 casas ou com data inválida", () => {
    const semValor = parcelas();
    semValor.parcelas[0] = { ...semValor.parcelas[0]!, amount: 0 };
    expect(erroDaParte(semValor)).toBe("Cada parcela de Parcelas precisa de valor.");

    const tresCasas = parcelas();
    tresCasas.parcelas[0] = { ...tresCasas.parcelas[0]!, amount: 3000.001 };
    expect(erroDaParte(tresCasas)).toBe("Use no máximo 2 casas decimais em Parcelas.");

    const dataRuim = parcelas();
    dataRuim.parcelas[0] = { ...dataRuim.parcelas[0]!, due_on: "2026-02-31" };
    expect(erroDaParte(dataRuim)).toBe("A data da parcela 1 de Parcelas não é válida.");

    const foraDoFormato = parcelas();
    foraDoFormato.parcelas[1] = { ...foraDoFormato.parcelas[1]!, due_on: "2027-1-10" };
    expect(erroDaParte(foraDoFormato)).toBe("A data da parcela 2 de Parcelas não é válida.");
  });
});

describe("erroDaParte — a conversão (FIC-13, P10)", () => {
  /** A parte "Cartão" do critério da 4b: R$ 21.527,76, de US$ 3.900. */
  const cartao = (extra: Partial<ParteDaForma> = {}): ParteDaForma => ({
    label: "Cartão",
    method: "cartao",
    currency: "BRL",
    total: 21527.76,
    installments_count: 1,
    usd_equivalent: 3900,
    parcelas: [{ number: 1, amount: 21527.76, due_on: "2026-12-15" }],
    ...extra,
  });

  it("a parte em reais convertida de dólar não tem erro", () => {
    expect(erroDaParte(cartao())).toBeNull();
  });

  it("só a parte em reais é convertida", () => {
    expect(
      erroDaParte(
        cartao({ currency: "USD", total: 3900, parcelas: [{ number: 1, amount: 3900, due_on: "2026-12-15" }] }),
      ),
    ).toBe("Só a parte em reais é convertida de dólar.");
  });

  it.each([0, -1, Number.NaN])("conversão %s pede o valor", (valor) => {
    expect(erroDaParte(cartao({ usd_equivalent: valor }))).toBe(
      "Informe de quantos dólares Cartão foi convertida.",
    );
  });

  it("acima do limite e com 3 casas, as frases da 4a", () => {
    expect(erroDaParte(cartao({ usd_equivalent: 10_000_000_000 }))).toBe("O valor de Cartão passa do limite.");
    expect(erroDaParte(cartao({ usd_equivalent: 3900.005 }))).toBe("Use no máximo 2 casas decimais em Cartão.");
  });

  it("o rótulo vem antes da conversão (a ordem do banco)", () => {
    expect(erroDaParte(cartao({ label: "", currency: "USD" }))).toBe(
      "Dê um nome à parte, com até 80 caracteres.",
    );
  });
});

describe("erroDaForma", () => {
  it("a 11ª parte é recusada", () => {
    const onze = Array.from({ length: 11 }, () => parcelas());
    expect(erroDaForma(onze)).toBe("A forma vai até 10 partes.");
  });

  it("devolve o primeiro erro das partes, ou nulo", () => {
    expect(erroDaForma([parcelas(), parcelas({ total: 0 })])).toBe("Informe o valor de Parcelas.");
    expect(erroDaForma([parcelas()])).toBeNull();
    expect(erroDaForma([])).toBeNull();
  });
});

describe("totais", () => {
  const partes = [
    { total: 10000, currency: "BRL" as const },
    { total: 9000, currency: "USD" as const },
  ];

  it("soma por moeda, nunca uma na outra", () => {
    expect(totaisDaForma(partes)).toEqual({ BRL: 10000, USD: 9000 });
    expect(totaisDaForma([{ total: 0.1, currency: "BRL" }, { total: 0.2, currency: "BRL" }])).toEqual({ BRL: 0.3 });
  });

  it("o texto do total junta as moedas com +, real antes de dólar", () => {
    expect(totalDaForma([partes[1]!, partes[0]!])).toBe(
      formatarMoeda(10000, "BRL") + " + " + formatarMoeda(9000, "USD"),
    );
    expect(totalDaForma([])).toBe("");
  });
});

describe("avisoDeCoerencia", () => {
  const vistos = [
    { amount: 8000, currency: "USD" },
    { amount: 6000, currency: "USD" },
  ];

  it("mesma moeda e totais diferentes: avisa", () => {
    expect(avisoDeCoerencia(vistos, [{ total: 13000, currency: "USD" }])).toBe(
      "A forma soma " + formatarMoeda(13000, "USD") + " e os vistos, " + formatarMoeda(14000, "USD") + ".",
    );
  });

  it("totais iguais, moedas misturadas ou nenhuma parte: não avisa", () => {
    expect(avisoDeCoerencia(vistos, [{ total: 14000, currency: "USD" }])).toBeNull();
    expect(
      avisoDeCoerencia(vistos, [
        { total: 10000, currency: "BRL" },
        { total: 9000, currency: "USD" },
      ]),
    ).toBeNull();
    expect(avisoDeCoerencia(vistos, [])).toBeNull();
  });
});

describe("avisoDeVencidas", () => {
  const com = (...datas: string[]) => [{ parcelas: datas.map((due_on) => ({ due_on })) }];

  it("conta só o que vence antes de hoje", () => {
    expect(avisoDeVencidas(com("2026-12-09", "2026-12-10"), BASE)).toBe("1 parcela já vencida");
    expect(avisoDeVencidas(com("2026-12-01", "2026-12-09"), BASE)).toBe("2 parcelas já vencidas");
    expect(avisoDeVencidas(com("2026-12-10"), BASE)).toBeNull();
  });
});

describe("avisosDoResumo (P1, P15)", () => {
  const HOJE = "2026-12-10";
  const parte = (total: number, currency: "BRL" | "USD", due_on: string) => ({
    id: "p1",
    label: "Parcelas",
    method: "transferencia" as const,
    currency,
    total,
    installments_count: 1,
    usd_equivalent: null,
    parcelas: [{ number: 1, amount: total, due_on }],
  });
  const resumo = (forma: Partial<ResumoDoGanho["forma"]>, extra: Partial<ResumoDoGanho> = {}): ResumoDoGanho => ({
    negocio: "n1",
    pessoa: { id: "pe1", nome: "Maria Souza", vira_cliente: true },
    itens: [
      { id: "i1", visa_name: "EB-1A", amount: 8000, currency: "USD" },
      { id: "i2", visa_name: "O-1", amount: 6000, currency: "USD" },
    ],
    processos: [],
    cobrancas: [],
    avisos: [],
    ...extra,
    forma: {
      situacao: "confirmada",
      confirmada_em: null,
      confirmada_por: null,
      cobrancas_criadas_em: null,
      partes: [],
      ...forma,
    },
  });

  it("confirmada com parcela de ontem e totais iguais: só a vencida", () => {
    expect(avisosDoResumo(resumo({ partes: [parte(14000, "USD", "2026-12-09")] }), HOJE)).toEqual([
      "1 parcela já vencida",
    ]);
  });

  it("confirmada com totais diferentes: a coerência", () => {
    expect(avisosDoResumo(resumo({ partes: [parte(13000, "USD", "2027-01-10")] }), HOJE)).toEqual([
      "A forma soma " + formatarMoeda(13000, "USD") + " e os vistos, " + formatarMoeda(14000, "USD") + ".",
    ]);
  });

  it("rascunho: a coerência sim, a vencida não (nada vai nascer)", () => {
    expect(
      avisosDoResumo(resumo({ situacao: "rascunho", partes: [parte(13000, "USD", "2026-12-09")] }), HOJE),
    ).toEqual(["A forma soma " + formatarMoeda(13000, "USD") + " e os vistos, " + formatarMoeda(14000, "USD") + "."]);
  });

  it("cobranças já criadas: o visto que ganha processo agora não está na forma, sem coerência", () => {
    const r = resumo(
      { situacao: "cobrancas_criadas", partes: [parte(13000, "USD", "2026-12-09")] },
      {
        itens: [
          { id: "i1", visa_name: "EB-1A", amount: 8000, currency: "USD" },
          { id: "i3", visa_name: "EB-2 NIW", amount: 5000, currency: "USD" },
        ],
        processos: [{ item: "i3", titulo: "EB-2 NIW — Maria Souza", id: null }],
      },
    );
    expect(avisosDoResumo(r, HOJE)).toEqual([
      "EB-2 NIW não está na forma de pagamento: crie a cobrança à mão na aba Financeiro.",
    ]);
  });

  it("sem forma: nenhum aviso", () => {
    expect(avisosDoResumo(resumo({ situacao: "sem_forma" }), HOJE)).toEqual([]);
  });
});

describe("linhaDaParte", () => {
  const parte = (total: number, quantidade: number, metodo: ParteDaForma["method"] = "transferencia") =>
    comParcelasGeradas(
      { label: "Parcelas", method: metodo, currency: "USD", total, installments_count: quantidade, usd_equivalent: null, parcelas: [] },
      "2026-12-10",
    );

  it("uma parcela: o valor e o dia", () => {
    expect(linhaDaParte(parte(13000, 1, "pix"))).toBe(
      `Parcelas · Pix · ${formatarMoeda(13000, "USD")} · 10/12/2026`,
    );
  });

  it("parcelas iguais: n × o valor, e as datas", () => {
    expect(linhaDaParte(parte(9000, 3))).toBe(
      `Parcelas · Transferência · 3 × ${formatarMoeda(3000, "USD")} · 10/12/2026, 10/01/2027, 10/02/2027`,
    );
  });

  it("parcelas que não dividem igual: o total, sem prometer um valor por parcela", () => {
    expect(linhaDaParte(parte(10000, 3))).toBe(
      `Parcelas · Transferência · 3 parcelas, ${formatarMoeda(10000, "USD")} · ` +
        "10/12/2026, 10/01/2027, 10/02/2027",
    );
  });

  it("a parte convertida diz de quantos dólares veio (FIC-13)", () => {
    const linha = linhaDaParte({
      label: "Cartão",
      method: "cartao",
      currency: "BRL",
      total: 21527.76,
      installments_count: 1,
      usd_equivalent: 3900,
      parcelas: [{ number: 1, amount: 21527.76, due_on: "2026-12-15" }],
    }).replaceAll(" ", " ");
    expect(linha).toBe("Cartão · Cartão · US$ 3.900 convertidos para R$ 21.527,76 · 15/12/2026");
  });

  it("parcelada e convertida: a conversão, depois as parcelas", () => {
    const parte = comParcelasGeradas(
      { label: "Parcelas", method: "pix", currency: "BRL", total: 30000, installments_count: 3, usd_equivalent: 5500, parcelas: [] },
      "2026-12-10",
    );
    expect(linhaDaParte(parte).replaceAll(" ", " ")).toBe(
      "Parcelas · Pix · US$ 5.500 convertidos para R$ 30.000 · 3 × R$ 10.000 · 10/12/2026, 10/01/2027, 10/02/2027",
    );
  });

  it("mais de 4 datas: a primeira e a última", () => {
    expect(linhaDaParte(parte(12000, 12))).toBe(
      `Parcelas · Transferência · 12 × ${formatarMoeda(1000, "USD")} · de 10/12/2026 a 10/11/2027`,
    );
  });
});
