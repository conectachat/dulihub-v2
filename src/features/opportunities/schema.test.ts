import { describe, expect, it } from "vitest";

import { resumoDoGanhoSchema } from "./schema";

/**
 * O que `ganhar_negocio` devolve chega como `Json`: o esquema é o que o
 * transforma em tipo sem `as unknown as` (AGENTS), e recusa um formato que
 * a tela não saberia desenhar.
 */

const EXEMPLO = {
  negocio: "11111111-1111-4111-8111-111111111111",
  pessoa: { id: "22222222-2222-4222-8222-222222222222", nome: "Maria Souza", vira_cliente: true },
  itens: [
    { id: "33333333-3333-4333-8333-333333333333", visa_name: "EB-1A", amount: 8000, currency: "USD" },
  ],
  processos: [
    { item: "33333333-3333-4333-8333-333333333333", titulo: "EB-1A — Maria Souza", id: null },
  ],
  forma: {
    situacao: "sem_forma",
    confirmada_em: null,
    confirmada_por: null,
    cobrancas_criadas_em: null,
    partes: [],
  },
  cobrancas: [],
  avisos: [],
};

/** A forma do critério (entrega 4a), confirmada, com as duas cobranças. */
const CONFIRMADA = {
  ...EXEMPLO,
  forma: {
    situacao: "confirmada",
    confirmada_em: "2026-11-21T13:00:00.000Z",
    confirmada_por: "Ana Lima",
    cobrancas_criadas_em: null,
    partes: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        label: "Entrada",
        method: "pix",
        currency: "BRL",
        total: 10000,
        installments_count: 1,
        parcelas: [{ number: 1, amount: 10000, due_on: "2026-12-10" }],
      },
    ],
  },
  cobrancas: [{ id: null, titulo: "Entrada — EB-1A", moeda: "BRL", total: 10000, parcelas: 1 }],
};

describe("resumoDoGanhoSchema", () => {
  it("aceita o formato de ganhar_negocio", () => {
    const lido = resumoDoGanhoSchema.parse(EXEMPLO);
    expect(lido.pessoa.vira_cliente).toBe(true);
    expect(lido.processos[0]!.titulo).toBe("EB-1A — Maria Souza");
  });

  it("aceita o processo já gravado, com id", () => {
    const gravado = {
      ...EXEMPLO,
      processos: [{ ...EXEMPLO.processos[0]!, id: "44444444-4444-4444-8444-444444444444" }],
    };
    expect(resumoDoGanhoSchema.safeParse(gravado).success).toBe(true);
  });

  it("recusa processo sem título", () => {
    const quebrado = { ...EXEMPLO, processos: [{ item: EXEMPLO.processos[0]!.item, id: null }] };
    expect(resumoDoGanhoSchema.safeParse(quebrado).success).toBe(false);
  });

  it("exige a forma de pagamento (0059), e lê a confirmada com as cobranças", () => {
    const semForma: Record<string, unknown> = { ...EXEMPLO };
    delete semForma.forma;
    expect(resumoDoGanhoSchema.safeParse(semForma).success).toBe(false);

    const lido = resumoDoGanhoSchema.parse(CONFIRMADA);
    expect(lido.forma.situacao).toBe("confirmada");
    expect(lido.forma.partes[0]!.parcelas[0]!.due_on).toBe("2026-12-10");
    expect(lido.cobrancas[0]).toEqual({ id: null, titulo: "Entrada — EB-1A", moeda: "BRL", total: 10000, parcelas: 1 });
  });

  it("recusa cobrança em moeda fora de BRL e USD", () => {
    const quebrado = { ...CONFIRMADA, cobrancas: [{ ...CONFIRMADA.cobrancas[0]!, moeda: "EUR" }] };
    expect(resumoDoGanhoSchema.safeParse(quebrado).success).toBe(false);
  });
});
