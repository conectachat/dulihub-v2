// @vitest-environment node

import { describe, expect, it } from "vitest";

import { ALL_SECTIONS } from "./sections";

/**
 * O que a Configuração anuncia como planejado. Itaú e C6 saíram do roadmap em
 * 23/nov (Renato): sem as credenciais dos bancos, o boleto sobe à mão e a
 * baixa é à mão. Anunciar a integração confundiria quem lê.
 */
describe("seções da Configuração", () => {
  it("não anunciam integração com Itaú nem C6", () => {
    const planejado = ALL_SECTIONS.flatMap((secao) => secao.planned ?? []).join(" | ");
    expect(planejado).not.toMatch(/Itaú|Itau|C6/i);
  });

  // Desde 24/nov Parceiros tem tela (PAR-4): não é mais "Fase 7".
  it("Parceiros deixou de ser planejada", () => {
    const parceiros = ALL_SECTIONS.find((secao) => secao.slug === "parceiros");
    expect(parceiros?.phase).toBeUndefined();
    expect(parceiros?.planned).toBeUndefined();
  });
});
