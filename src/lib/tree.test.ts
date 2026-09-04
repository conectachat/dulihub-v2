import { describe, expect, it } from "vitest";

import { flattenTree, indentStyle } from "./tree";

/**
 * `flattenTree` decide o que aparece na tela em quatro lugares: catálogo de
 * documentos, etapas do visto, documentos exigidos e — em breve — etapas do
 * processo. Também alimenta a contagem que o aviso de exclusão mostra e o
 * desabilitar das setas de reordenar.
 *
 * Ou seja: um erro aqui apaga a coisa errada e esconde a linha certa. Era o
 * código mais usado e menos verificado da base.
 */

type No = { id: string; parent_id: string | null; position: number; name?: string };

const no = (id: string, parent_id: string | null, position: number): No => ({
  id,
  parent_id,
  position,
});

describe("flattenTree", () => {
  it("devolve lista vazia para entrada vazia", () => {
    expect(flattenTree([])).toEqual([]);
  });

  it("ordena irmãos por posição, não pela ordem de chegada", () => {
    const saida = flattenTree([no("c", null, 2), no("a", null, 0), no("b", null, 1)]);
    expect(saida.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("intercala filhos logo abaixo do pai, em ordem de leitura", () => {
    const saida = flattenTree([
      no("raiz2", null, 1),
      no("raiz1", null, 0),
      no("filho2", "raiz1", 1),
      no("filho1", "raiz1", 0),
      no("neto", "filho1", 0),
    ]);

    expect(saida.map((n) => n.id)).toEqual([
      "raiz1",
      "filho1",
      "neto",
      "filho2",
      "raiz2",
    ]);
  });

  it("marca a profundidade de cada nível", () => {
    const saida = flattenTree([
      no("a", null, 0),
      no("b", "a", 0),
      no("c", "b", 0),
    ]);
    expect(saida.map((n) => n.depth)).toEqual([0, 1, 2]);
  });

  it("marca primeiro e último entre irmãos, não na lista inteira", () => {
    const saida = flattenTree([
      no("a", null, 0),
      no("a1", "a", 0),
      no("a2", "a", 1),
      no("b", null, 1),
    ]);

    const por = (id: string) => saida.find((n) => n.id === id)!;

    // "a1" é o primeiro filho de "a", ainda que seja o segundo da lista plana.
    expect(por("a1").isFirst).toBe(true);
    expect(por("a1").isLast).toBe(false);
    expect(por("a2").isLast).toBe(true);
    expect(por("a").isFirst).toBe(true);
    expect(por("b").isLast).toBe(true);
  });

  it("conta a subárvore inteira, não só os filhos diretos", () => {
    // É esta contagem que o aviso de exclusão mostra. Contar só os filhos
    // diretos diria "apaga 1 item" antes de apagar três.
    const saida = flattenTree([
      no("a", null, 0),
      no("b", "a", 0),
      no("c", "b", 0),
      no("d", "b", 1),
    ]);

    expect(saida.find((n) => n.id === "a")!.descendants).toBe(3);
    expect(saida.find((n) => n.id === "b")!.descendants).toBe(2);
    expect(saida.find((n) => n.id === "c")!.descendants).toBe(0);
  });

  it("preserva os campos próprios do nó", () => {
    const saida = flattenTree([
      { id: "a", parent_id: null, position: 0, name: "Rendimentos" },
    ]);
    expect(saida[0].name).toBe("Rendimentos");
  });

  it("mostra o nó órfão na raiz em vez de sumir com ele", () => {
    // Um nó cujo pai não está no conjunto — pai apagado, consulta filtrada,
    // ou seleção parcial. Sumir calado é o pior desfecho: o registro existe
    // no banco e não há tela que o alcance para arrumar ou apagar.
    const saida = flattenTree([no("a", null, 0), no("orfao", "sumiu", 0)]);

    expect(saida.map((n) => n.id)).toContain("orfao");
    expect(saida.find((n) => n.id === "orfao")!.depth).toBe(0);
  });

  it("não trava quando a hierarquia tem ciclo", () => {
    // O gatilho do banco impede fechar ciclo, mas ele não é a única porta:
    // importação, correção manual em SQL e restauração de backup passam por
    // fora. Aqui isso era estouro de pilha — a tela inteira em branco.
    const saida = flattenTree([no("a", "b", 0), no("b", "a", 0)]);

    expect(saida).toHaveLength(2);
    expect(saida.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });

  it("não trava quando o nó é pai de si mesmo", () => {
    const saida = flattenTree([no("a", "a", 0)]);
    expect(saida.map((n) => n.id)).toEqual(["a"]);
  });
});

describe("indentStyle", () => {
  it("recua 1,5rem por nível", () => {
    expect(indentStyle(0)).toEqual({ marginLeft: "0rem" });
    expect(indentStyle(2)).toEqual({ marginLeft: "3rem" });
  });

  it("para de recuar no quinto nível, para a linha não sair da tela", () => {
    expect(indentStyle(5)).toEqual({ marginLeft: "7.5rem" });
    expect(indentStyle(9)).toEqual({ marginLeft: "7.5rem" });
  });
});
