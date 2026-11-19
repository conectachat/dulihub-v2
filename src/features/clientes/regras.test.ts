// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  caminhoDoDocumento,
  contagemDaLista,
  documentosPorCategoria,
  paginaPedida,
  POR_PAGINA,
} from "./regras";

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

describe("caminhoDoDocumento", () => {
  it("organização, pessoa, id do arquivo e o nome limpo: as 4 partes que o banco confere", () => {
    expect(caminhoDoDocumento("o1", "p1", "a1", "Comprovante de residência.pdf")).toBe(
      "o1/p1/a1/comprovante-de-residencia.pdf",
    );
  });

  it("barra no nome não vira pasta", () => {
    expect(caminhoDoDocumento("o1", "p1", "a1", "rg/frente.jpg")).toBe("o1/p1/a1/rg-frente.jpg");
  });
});

describe("documentosPorCategoria", () => {
  const doc = (id: string, category: string) => ({ id, category });

  it("agrupa na ordem identidade, passaporte, comprovante, contrato, outro — só as que têm", () => {
    const grupos = documentosPorCategoria([
      doc("1", "outro"),
      doc("2", "passaporte"),
      doc("3", "contrato"),
      doc("4", "passaporte"),
      doc("5", "identidade"),
    ]);

    expect(grupos.map((g) => [g.rotulo, g.documentos.map((d) => d.id)])).toEqual([
      ["Identidade", ["5"]],
      ["Passaporte", ["2", "4"]],
      ["Contrato", ["3"]],
      ["Outro", ["1"]],
    ]);
  });

  it("categoria desconhecida cai em Outro, em vez de sumir", () => {
    const grupos = documentosPorCategoria([doc("1", "xyz")]);

    expect(grupos.map((g) => g.rotulo)).toEqual(["Outro"]);
  });
});
