import { describe, expect, it } from "vitest";

import { parceiroSchema, stageStatusColorSchema, tagSchema, toCode, visaTypeSchema } from "./schema";

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

describe("parceiroSchema", () => {
  // As mesmas regras do gatilho `organizations_regra_do_parceiro` (0068), no
  // navegador, antes de a gravação entrar na fila.
  const VALIDO = {
    name: " Thais Fabrini ",
    legal_name: "",
    address_country: "Estados Unidos",
    tax_id: "",
    address_street: "",
    address_number: "",
    address_complement: "",
    address_district: "",
    address_city: "Miami",
    address_state: "",
    address_postal_code: "",
    email: "thais@exemplo.com",
    phone_country_code: "1",
    phone: "3055550100",
  };
  const erro = (campos: Partial<typeof VALIDO>) => {
    const r = parceiroSchema.safeParse({ ...VALIDO, ...campos });
    return r.success ? null : r.error.issues[0];
  };

  it("apara, grava o DDI com o + e manda vazio como nulo", () => {
    const r = parceiroSchema.parse(VALIDO);
    expect(r.name).toBe("Thais Fabrini");
    expect(r.phone_country_code).toBe("+1");
    expect(r.legal_name).toBeNull();
    expect(r.address_city).toBe("Miami");
  });

  it("exige o nome e o país", () => {
    expect(erro({ name: "  " })?.message).toBe("Informe o nome do parceiro.");
    expect(erro({ address_country: "" })?.message).toBe("Informe o país.");
  });

  it("aponta o erro de contato no campo dele", () => {
    const e = erro({ email: "x" });
    expect(e?.message).toBe("E-mail inválido");
    expect(e?.path).toEqual(["email"]);
  });

  it("documento fiscal até 50", () => {
    expect(erro({ tax_id: "x".repeat(51) })?.message).toBe("Texto longo demais em um dos campos.");
    expect(erro({ tax_id: "x".repeat(50) })).toBeNull();
  });
});
