import { describe, expect, it } from "vitest";

import { stageStatusColorSchema, tagSchema, toCode, visaTypeSchema } from "./schema";

/**
 * As regras de entrada da Configuração.
 *
 * Elas já existiam dentro das Server Actions, sem teste — e vão passar a
 * rodar no navegador, antes de a gravação entrar na fila. Provar que não
 * mudaram de comportamento ao mudar de lugar é o ponto deste arquivo.
 */

describe("tagSchema", () => {
  it("apara o nome e recusa vazio", () => {
    expect(tagSchema.safeParse({ name: "  EB-1A ", color: "#ff6600" }).data?.name).toBe(
      "EB-1A",
    );
    expect(tagSchema.safeParse({ name: "   ", color: "#ff6600" }).success).toBe(false);
  });

  it("aceita só cor da paleta — cor livre entraria no banco e ninguém veria", () => {
    expect(tagSchema.safeParse({ name: "x", color: "#123456" }).success).toBe(false);
  });
});

describe("toCode", () => {
  it("tira acento, espaço e maiúscula", () => {
    expect(toCode("Em análise")).toBe("em_analise");
    expect(toCode("A fazer!!")).toBe("a_fazer");
  });

  it("nome que não sobra nada ainda vira um código", () => {
    expect(toCode("!!!")).toBe("status");
  });

  it("dois nomes diferentes podem dar o mesmo código", () => {
    // Não é defeito, é o motivo de a colisão precisar ser conferida contra o
    // que já existe — e, offline, contra o espelho, na hora de digitar.
    expect(toCode("Em análise")).toBe(toCode("em analise"));
  });
});

describe("stageStatusColorSchema", () => {
  it("exige hexadecimal de seis dígitos", () => {
    expect(stageStatusColorSchema.safeParse("#abc").success).toBe(false);
    expect(stageStatusColorSchema.safeParse("#a1b2c3").success).toBe(true);
  });
});

describe("visaTypeSchema", () => {
  it("preço em português vira número, e vazio vira nulo", () => {
    expect(visaTypeSchema.safeParse({ name: "EB-1A", base_price: "1.500,50" }).data?.base_price)
      .toBe(1500.5);
    expect(visaTypeSchema.safeParse({ name: "EB-1A", base_price: "" }).data?.base_price)
      .toBeNull();
  });
});
