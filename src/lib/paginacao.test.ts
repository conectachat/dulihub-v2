import { describe, expect, it } from "vitest";

import { contagemDaLista, paginaPedida, POR_PAGINA } from "./paginacao";

/**
 * Listas de 50 por vez que dizem sempre o total: o app antigo cortava em
 * silêncio, e quem procurava o item 51 concluía que ele não existia (o M1).
 * Clientes e Encerradas usam as mesmas regras.
 */

const CLIENTES = { singular: "cliente", plural: "clientes" };
const ENCERRADAS = { singular: "oportunidade encerrada", plural: "oportunidades encerradas" };

describe("paginaPedida", () => {
  it("lê o número da URL", () => {
    expect(paginaPedida("3")).toBe(3);
  });

  it("sem número inteiro positivo, a primeira", () => {
    for (const valor of [undefined, "", "0", "-2", "1.5", "abc"]) {
      expect(paginaPedida(valor)).toBe(1);
    }
  });
});

describe("contagemDaLista", () => {
  it("cabendo tudo numa página, diz quantos são, no singular ou no plural", () => {
    expect(contagemDaLista({ total: 30, pagina: 1, naPagina: 30, substantivo: CLIENTES })).toBe(
      "30 clientes",
    );
    expect(contagemDaLista({ total: 1, pagina: 1, naPagina: 1, substantivo: CLIENTES })).toBe(
      "1 cliente",
    );
    expect(contagemDaLista({ total: 2, pagina: 1, naPagina: 2, substantivo: ENCERRADAS })).toBe(
      "2 oportunidades encerradas",
    );
  });

  it("com mais de uma página, diz o trecho e o total", () => {
    expect(POR_PAGINA).toBe(50);
    expect(contagemDaLista({ total: 72, pagina: 1, naPagina: 50, substantivo: CLIENTES })).toBe(
      "Mostrando 1–50 de 72",
    );
    expect(contagemDaLista({ total: 72, pagina: 2, naPagina: 22, substantivo: CLIENTES })).toBe(
      "Mostrando 51–72 de 72",
    );
  });

  it("sem ninguém, não diz nada (a tela mostra a lista vazia)", () => {
    expect(contagemDaLista({ total: 0, pagina: 1, naPagina: 0, substantivo: CLIENTES })).toBeNull();
  });
});
