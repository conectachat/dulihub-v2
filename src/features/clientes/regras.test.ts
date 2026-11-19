// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  caminhoDoDocumento,
  documentosPorCategoria,
} from "./regras";

/** Os documentos do cliente (CLI-8). A paginação mora em `@/lib/paginacao`. */

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
