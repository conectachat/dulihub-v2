// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { ItemDaFila, Operacao } from "./fila";
import { sobrepor } from "./sobreposicao";

/**
 * A leitura enxergando o que ainda não subiu.
 *
 * O que se prova aqui é que a tela mostra o que a pessoa fez **antes** de o
 * servidor saber, sem que isso encoste no espelho — que continua sendo só a
 * cópia do servidor, e por isso continua podendo ser conferido pelo
 * manifesto.
 */

let relogio = 0;

function item(passos: Operacao[], extra: Partial<ItemDaFila> = {}): ItemDaFila {
  relogio += 1;
  return {
    id: `i${relogio}`,
    alvo: "x",
    depende: [],
    passos,
    rotulo: "",
    criada_em: `2026-09-21T10:00:${String(relogio).padStart(2, "0")}Z`,
    estado: "pendente",
    enviada_em: null,
    motivo: null,
    ...extra,
  };
}

const t1 = { id: "t1", name: "EB-1A", position: 0 };
const t2 = { id: "t2", name: "Indicação", position: 1 };

describe("sobrepor", () => {
  it("fila vazia devolve o espelho como está", () => {
    expect(sobrepor("tags", [t1, t2], [])).toEqual([t1, t2]);
  });

  it("criada no avião aparece na hora, marcada", () => {
    const linhas = sobrepor("tags", [t1], [
      item([{ tipo: "insert", tabela: "tags", linha: { id: "t9", name: "Nova" } }]),
    ]);

    expect(linhas.map((l) => l.id)).toEqual(["t1", "t9"]);
    expect(linhas[1].pendente).toBe(true);
    expect(linhas[0].pendente).toBeUndefined();
  });

  it("editada mostra o valor novo, não o do servidor", () => {
    const linhas = sobrepor("tags", [t1], [
      item([{ tipo: "update", tabela: "tags", id: "t1", patch: { name: "EB-1A ajustada" } }]),
    ]);

    expect(linhas[0].name).toBe("EB-1A ajustada");
    expect(linhas[0].pendente).toBe(true);
  });

  it("apagada some, mesmo continuando no espelho", () => {
    const linhas = sobrepor("tags", [t1, t2], [
      item([{ tipo: "delete", tabela: "tags", id: "t1" }]),
    ]);

    expect(linhas.map((l) => l.id)).toEqual(["t2"]);
  });

  it("criar e depois renomear termina com o nome final, numa linha só", () => {
    const linhas = sobrepor("tags", [], [
      item([{ tipo: "insert", tabela: "tags", linha: { id: "t9", name: "Rascunho" } }]),
      item([{ tipo: "update", tabela: "tags", id: "t9", patch: { name: "Pronta" } }]),
    ]);

    expect(linhas).toHaveLength(1);
    expect(linhas[0].name).toBe("Pronta");
  });

  it("criar e depois apagar não deixa nada para trás", () => {
    const linhas = sobrepor("tags", [], [
      item([{ tipo: "insert", tabela: "tags", linha: { id: "t9", name: "Engano" } }]),
      item([{ tipo: "delete", tabela: "tags", id: "t9" }]),
    ]);

    expect(linhas).toEqual([]);
  });

  it("editar linha que este aparelho não tem não a inventa", () => {
    // Apagada por outra pessoa, ou nunca recebida. Mostrar seria pintar na
    // tela um registro que não existe em lugar nenhum.
    const linhas = sobrepor("tags", [t1], [
      item([{ tipo: "update", tabela: "tags", id: "sumida", patch: { name: "x" } }]),
    ]);

    expect(linhas.map((l) => l.id)).toEqual(["t1"]);
  });

  it("item de outra tabela não encosta nesta", () => {
    const linhas = sobrepor("tags", [t1], [
      item([{ tipo: "delete", tabela: "document_types", id: "t1" }]),
    ]);

    expect(linhas).toEqual([t1]);
  });

  it("recusada continua visível, com o motivo junto", () => {
    const linhas = sobrepor("tags", [t1], [
      item([{ tipo: "update", tabela: "tags", id: "t1", patch: { name: "Recusada" } }], {
        estado: "conflito",
        motivo: "Você não tem permissão para isto.",
      }),
    ]);

    expect(linhas[0].name).toBe("Recusada");
    expect(linhas[0].conflito).toBe("Você não tem permissão para isto.");
  });

  it("reordenação feita offline já aparece na ordem nova", () => {
    const linhas = sobrepor("document_types", [
      { id: "a", position: 0 },
      { id: "b", position: 1 },
    ], [
      item([
        {
          tipo: "rpc",
          nome: "reordenar_irmaos",
          args: { p_tabela: "document_types", p_ids: ["b", "a"] },
        },
      ]),
    ]);

    expect(linhas.find((l) => l.id === "b")!.position).toBe(0);
    expect(linhas.find((l) => l.id === "a")!.position).toBe(1);
  });
});
