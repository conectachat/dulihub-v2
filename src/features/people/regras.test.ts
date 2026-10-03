import { describe, expect, it } from "vitest";

import { perfilCompleto } from "./regras";

/**
 * Quem vê Processos e Financeiro na ficha do contato.
 *
 * Lead não é cliente: enquanto o negócio está no funil, a ficha dele não
 * mostra projeto nem cobrança. O perfil completo chega com o Ganho — o
 * contrato assinado (decisão do Renato, 3/out).
 */
describe("perfilCompleto", () => {
  it("cliente tem o perfil completo", () => {
    expect(perfilCompleto({ estagio: "client", processos: 0, cobrancas: 0 })).toBe(true);
  });

  it("contato e lead, não", () => {
    expect(perfilCompleto({ estagio: "contact", processos: 0, cobrancas: 0 })).toBe(false);
    expect(perfilCompleto({ estagio: "opportunity", processos: 0, cobrancas: 0 })).toBe(false);
  });

  it("quem já tem processo aparece inteiro, seja qual for o estágio", () => {
    // Em 3/out havia dois contatos assim. Esconder por estágio apagaria da
    // tela um processo em andamento — e dado escondido é dado perdido.
    expect(perfilCompleto({ estagio: "opportunity", processos: 1, cobrancas: 0 })).toBe(true);
  });

  it("quem já tem cobrança, também", () => {
    expect(perfilCompleto({ estagio: "contact", processos: 0, cobrancas: 2 })).toBe(true);
  });
});
