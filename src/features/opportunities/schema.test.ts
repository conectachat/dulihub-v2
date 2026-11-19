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
  cobrancas: [],
  avisos: [],
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
});
