// @vitest-environment node

import { describe, expect, it } from "vitest";

import { contagemDaLista, paginaPedida, POR_PAGINA } from "./regras";

/** A paginação da lista de Clientes, sem corte silencioso (CLI-1, o M1). */

describe("paginaPedida", () => {
  it("lê o número da URL", () => {
    expect(paginaPedida("3")).toBe(3);
  });

  it("sem página, ou com lixo, é a primeira", () => {
    for (const valor of [undefined, "", "0", "-2", "abc", "1.5"]) {
      expect(paginaPedida(valor), String(valor)).toBe(1);
    }
  });
});

describe("contagemDaLista", () => {
  it("cabendo tudo numa página, diz quantos são", () => {
    expect(contagemDaLista({ total: 30, pagina: 1, naPagina: 30 })).toBe("30 clientes");
    expect(contagemDaLista({ total: 1, pagina: 1, naPagina: 1 })).toBe("1 cliente");
  });

  it("com mais de uma página, diz o trecho e o total", () => {
    expect(POR_PAGINA).toBe(50);
    expect(contagemDaLista({ total: 72, pagina: 1, naPagina: 50 })).toBe("Mostrando 1–50 de 72");
    expect(contagemDaLista({ total: 72, pagina: 2, naPagina: 22 })).toBe("Mostrando 51–72 de 72");
  });

  it("sem ninguém, não diz nada (a tela mostra a lista vazia)", () => {
    expect(contagemDaLista({ total: 0, pagina: 1, naPagina: 0 })).toBeNull();
  });
});
