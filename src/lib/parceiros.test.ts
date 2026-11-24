import { describe, expect, it } from "vitest";

import { contatoExibido, ehDonoDaRaiz, parceirosVisiveis } from "./parceiros";

/**
 * As regras do cliente de parceiro que valem nos dois lados (servidor e
 * aparelho): o contato que aparece, quais parceiros oferecer, quem cadastra.
 */

const THAIS = {
  name: "Thais Fabrini",
  email: "thais@exemplo.com",
  phone_country_code: "+1",
  phone: "3055550100",
};

describe("contatoExibido", () => {
  const pessoa = { email: "fulano@exemplo.com", phone_country_code: "+55", phone: "11999990000" };

  it("sem vínculo, é o contato da pessoa", () => {
    expect(contatoExibido({ ...pessoa, partner_organization_id: null }, null)).toEqual({
      email: "fulano@exemplo.com",
      ddi: "+55",
      telefone: "11999990000",
      via: null,
    });
  });

  it("a linha antiga do espelho, sem a chave do vínculo, dá o mesmo que o vínculo nulo", () => {
    expect(contatoExibido(pessoa, undefined)).toEqual(
      contatoExibido({ ...pessoa, partner_organization_id: null }, null),
    );
  });

  it("com vínculo, o contato do parceiro vence o da pessoa", () => {
    expect(contatoExibido({ ...pessoa, partner_organization_id: "p1" }, THAIS)).toEqual({
      email: "thais@exemplo.com",
      ddi: "+1",
      telefone: "3055550100",
      via: "Thais Fabrini",
    });
  });

  it("com vínculo e sem o parceiro à mão, não mostra contato nenhum", () => {
    expect(contatoExibido({ ...pessoa, partner_organization_id: "p1" }, null)).toEqual({
      email: null,
      ddi: null,
      telefone: null,
      via: null,
    });
  });
});

describe("parceirosVisiveis", () => {
  const org = (id: string, name: string, type: string, is_test: boolean) => ({ id, name, type, is_test });
  const DULI = org("duli", "Duli", "root", false);
  const THAIS_ORG = org("thais", "Thais Fabrini", "partner", false);
  const ANA = org("ana", "Ana Parceira", "partner", false);
  const PARCEIRO_TESTE = org("parceiro-teste", "Parceiro de Teste", "partner", true);
  const EXECUTORA = org("executora-teste", "Executora de Teste", "partner", true);
  const todas = [THAIS_ORG, PARCEIRO_TESTE, EXECUTORA, DULI, ANA];

  it("na Duli, só os parceiros reais, em ordem de nome", () => {
    expect(parceirosVisiveis(todas, "duli").map((o) => o.id)).toEqual(["ana", "thais"]);
  });

  it("numa organização de teste, só os de teste, e nunca ela mesma", () => {
    expect(parceirosVisiveis(todas, "executora-teste").map((o) => o.id)).toEqual(["parceiro-teste"]);
  });

  it("sem organização atual, só os reais", () => {
    expect(parceirosVisiveis(todas, null).map((o) => o.id)).toEqual(["ana", "thais"]);
  });
});

describe("ehDonoDaRaiz", () => {
  it("só o dono da raiz", () => {
    expect(ehDonoDaRaiz("owner", "root")).toBe(true);
    expect(ehDonoDaRaiz("admin", "root")).toBe(false);
    expect(ehDonoDaRaiz("owner", "partner")).toBe(false);
    expect(ehDonoDaRaiz(null, "root")).toBe(false);
    expect(ehDonoDaRaiz("owner", undefined)).toBe(false);
  });
});
