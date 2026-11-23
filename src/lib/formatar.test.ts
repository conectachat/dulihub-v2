import { describe, expect, it } from "vitest";

import {
  diaEmSaoPaulo,
  formatarData,
  formatarDataHora,
  formatarDia,
  formatarDiaDaSemana,
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

describe("diaEmSaoPaulo", () => {
  it("o dia de São Paulo de um instante, em AAAA-MM-DD", () => {
    // 22h30 de 01/11 em São Paulo ainda é dia 1.
    expect(diaEmSaoPaulo("2026-11-02T01:30:00Z")).toBe("2026-11-01");
    // O início do dia 1 em São Paulo (como o Ajustar grava) é dia 1.
    expect(diaEmSaoPaulo("2026-11-01T03:00:00Z")).toBe("2026-11-01");
  });

  it("o início do dia em São Paulo aparece como esse dia", () => {
    expect(formatarData("2026-11-01T03:00:00+00:00")).toBe("01/11/2026");
  });
});

describe("formatarDiaDaSemana", () => {
  it("o dia com a semana, curto e longo, sem voltar um dia", () => {
    expect(formatarDiaDaSemana("2026-11-26", "longo")).toBe("quinta-feira, 26/11");
    expect(formatarDiaDaSemana("2026-11-26", "curto")).toBe("qui, 26/11");
    expect(formatarDiaDaSemana("2026-12-02", "longo")).toBe("quarta-feira, 02/12");
  });
});
