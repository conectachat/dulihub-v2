import { describe, expect, it } from "vitest";

import {
  contagemPorVisto,
  etapasComContagem,
  tagsComContagem,
  usosDoCatalogo,
} from "./montagem";

/**
 * As contagens da tela de Configuração.
 *
 * Nenhuma delas é coluna no banco: são montadas depois da consulta. Ficam
 * aqui, puras, porque **dois caminhos** as usam agora — o servidor
 * (`queries.ts`) e o espelho offline (`consultas-locais.ts`). Se cada lado
 * montasse a sua, a mesma tela mostraria números diferentes com e sem
 * internet, e ninguém desconfiaria de nada.
 */

describe("etapasComContagem", () => {
  const etapas = [
    { id: "e1", name: "Novo", position: 0, is_won: false, is_lost: false },
    { id: "e2", name: "Ganho", position: 1, is_won: true, is_lost: false },
  ];

  it("conta os negócios de cada etapa", () => {
    const resultado = etapasComContagem(etapas, [
      { stage_id: "e1" },
      { stage_id: "e1" },
      { stage_id: "e2" },
    ]);

    expect(resultado.map((e) => [e.name, e.opportunity_count])).toEqual([
      ["Novo", 2],
      ["Ganho", 1],
    ]);
  });

  it("etapa sem negócio conta zero, não some da lista", () => {
    // Zero é o que autoriza excluir a etapa sem medo; sumir seria mentira.
    expect(etapasComContagem(etapas, [])).toHaveLength(2);
    expect(etapasComContagem(etapas, [])[0].opportunity_count).toBe(0);
  });
});

describe("tagsComContagem", () => {
  it("conta quantos contatos usam cada tag", () => {
    const tags = [
      { id: "t1", name: "EB-1", color: "#f60" },
      { id: "t2", name: "Sem uso", color: null },
    ];

    expect(
      tagsComContagem(tags, [{ tag_id: "t1" }, { tag_id: "t1" }, { tag_id: "t9" }]),
    ).toEqual([
      { id: "t1", name: "EB-1", color: "#f60", person_count: 2 },
      { id: "t2", name: "Sem uso", color: null, person_count: 0 },
    ]);
  });
});

describe("usosDoCatalogo", () => {
  it("diz quais vistos exigem cada pasta", () => {
    // É o que o aviso de exclusão lê: apagar a pasta tira a exigência de
    // todos eles, e essa é a única chance de dizer isso antes.
    expect(
      usosDoCatalogo([
        { document_type_id: "d1", nome: "EB-1A" },
        { document_type_id: "d1", nome: "EB-2 NIW" },
        { document_type_id: "d2", nome: "EB-1A" },
      ]),
    ).toEqual({ d1: ["EB-1A", "EB-2 NIW"], d2: ["EB-1A"] });
  });

  it("pasta que ninguém exige não aparece", () => {
    expect(usosDoCatalogo([])).toEqual({});
  });
});

describe("contagemPorVisto", () => {
  it("conta linhas por tipo de visto", () => {
    expect(
      contagemPorVisto([
        { visa_type_id: "v1" },
        { visa_type_id: "v1" },
        { visa_type_id: "v2" },
      ]),
    ).toEqual({ v1: 2, v2: 1 });
  });

  it("nada a contar devolve vazio, e a tela mostra zero", () => {
    expect(contagemPorVisto([])).toEqual({});
  });
});
