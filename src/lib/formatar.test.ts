import { describe, expect, it } from "vitest";

import {
  formatarData,
  formatarDataHora,
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

describe("formatarDataHora", () => {
  it("acrescenta hora e minuto", () => {
    expect(formatarDataHora("2026-09-17T12:30:00-03:00")).toMatch(
      /^17\/09\/2026,? 12:30$/,
    );
  });
});
