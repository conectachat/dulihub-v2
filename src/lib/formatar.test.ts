import { describe, expect, it } from "vitest";

import {
  formatarData,
  formatarDataHora,
  formatarDia,
  hojeEmSaoPaulo,
  iniciais,
  telefoneCompleto,
} from "./formatar";

describe("iniciais", () => {
  it.each([
    ["Renato Drumond", "RD"],
    ["renato", "R"],
    ["  Maria   da  Silva ", "MD"],
    ["", ""],
  ])("%j vira %j", (nome, esperado) => {
    expect(iniciais(nome)).toBe(esperado);
  });
});

describe("telefoneCompleto", () => {
  it("junta DDI e número com espaço", () => {
    expect(telefoneCompleto("+55", "31 99999-0000")).toBe("+55 31 99999-0000");
  });

  it("devolve só o número quando não há DDI", () => {
    expect(telefoneCompleto(null, "31 99999-0000")).toBe("31 99999-0000");
  });

  it("devolve nulo sem número, mesmo com DDI", () => {
    // Senão a ficha mostra "+55" sozinho, que parece telefone e não é.
    expect(telefoneCompleto("+55", null)).toBeNull();
    expect(telefoneCompleto("+55", "")).toBeNull();
  });
});

describe("formatarData", () => {
  it("usa dia/mês/ano brasileiro", () => {
    expect(formatarData("2026-09-17T12:00:00Z")).toBe("17/09/2026");
  });
});

describe("formatarDia", () => {
  it("mostra a data do banco como ela é, sem andar um dia para trás", () => {
    // `formatarData("2026-09-18")` lê meia-noite UTC e, no fuso de São Paulo,
    // mostra 17/09. Prazo de pasta e data de protocolo são dia, não instante.
    expect(formatarDia("2026-09-18")).toBe("18/09/2026");
    expect(formatarDia("2027-01-01")).toBe("01/01/2027");
  });
});

describe("hojeEmSaoPaulo", () => {
  it("às 22h de São Paulo ainda é hoje, não amanhã em UTC", () => {
    expect(hojeEmSaoPaulo(new Date("2026-09-18T22:30:00-03:00"))).toBe("2026-09-18");
    expect(hojeEmSaoPaulo(new Date("2026-09-19T01:00:00Z"))).toBe("2026-09-18");
  });
});

describe("formatarDataHora", () => {
  it("acrescenta hora e minuto", () => {
    expect(formatarDataHora("2026-09-17T12:30:00-03:00")).toMatch(
      /^17\/09\/2026,? 12:30$/,
    );
  });
});
