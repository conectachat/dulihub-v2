import { describe, expect, it } from "vitest";

import { ddiGravado, estagioFinal } from "../../migration/regras-da-importacao.mjs";

/**
 * Regras da importação do app antigo (`migration/import-people.mjs`).
 *
 * O script pode rodar de novo a qualquer momento, e o banco novo já tem vida
 * própria: quem virou cliente aqui não pode voltar a lead porque o app antigo
 * ainda o tem como lead — e, desde a 0045, o banco recusaria o lote inteiro.
 */

describe("estagioFinal", () => {
  it("fica com o maior: contato < oportunidade < cliente", () => {
    expect(estagioFinal("client", "opportunity")).toBe("client");
    expect(estagioFinal("client", "contact")).toBe("client");
    expect(estagioFinal("opportunity", "contact")).toBe("opportunity");
    expect(estagioFinal("contact", "client")).toBe("client");
    expect(estagioFinal("opportunity", "client")).toBe("client");
  });

  it("pessoa que ainda não existe no banco fica com o estágio do app antigo", () => {
    expect(estagioFinal(undefined, "opportunity")).toBe("opportunity");
    expect(estagioFinal(null, "contact")).toBe("contact");
  });
});

describe("ddiGravado", () => {
  it("grava o DDI como \"+NN\", como a 0040", () => {
    expect(ddiGravado("55")).toBe("+55");
    expect(ddiGravado("+55")).toBe("+55");
    expect(ddiGravado(" 1 ")).toBe("+1");
    expect(ddiGravado("+351")).toBe("+351");
  });

  it("sem dígito nenhum, fica nulo", () => {
    expect(ddiGravado(null)).toBeNull();
    expect(ddiGravado(undefined)).toBeNull();
    expect(ddiGravado("")).toBeNull();
    expect(ddiGravado("+")).toBeNull();
  });
});
