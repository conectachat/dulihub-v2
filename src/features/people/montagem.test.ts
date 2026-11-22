import { describe, expect, it } from "vitest";

import { montarLinhaDoTempo, type AtividadeLida, type NotaLida } from "./montagem";

/**
 * A linha do tempo da pessoa junta notas e atividades numa lista só, da mais
 * recente para a mais antiga. O que o sistema grava sozinho (movimento no
 * funil, ficha recebida, virou cliente) não se edita nem se apaga.
 */

const autora = { full_name: "Ana Lima", email: "ana@teste.dulihub" };

function nota(id: string, quando: string): NotaLida {
  return { id, body: `nota ${id}`, created_at: quando, created_by: "u1", author: autora };
}

function atividade(id: string, tipo: string, quando: string): AtividadeLida {
  return {
    id,
    type: tipo,
    description: `atividade ${id}`,
    occurred_at: quando,
    created_by: "u1",
    author: null,
  };
}

describe("montarLinhaDoTempo", () => {
  it("virou_cliente é registro do sistema: não se apaga", () => {
    const [item] = montarLinhaDoTempo([], [atividade("a1", "virou_cliente", "2026-11-18T12:00:00Z")]);

    expect(item.system).toBe(true);
  });

  it("forma de pagamento é registro do sistema: não se apaga (entrega 4a)", () => {
    const [item] = montarLinhaDoTempo(
      [],
      [atividade("a1", "forma_de_pagamento", "2026-11-21T12:00:00Z")],
    );

    expect(item.system).toBe(true);
  });

  it("movimento no funil e ficha recebida são do sistema; ligação não", () => {
    const itens = montarLinhaDoTempo(
      [],
      [
        atividade("a1", "stage_change", "2026-11-18T12:00:00Z"),
        atividade("a2", "registration_submitted", "2026-11-17T12:00:00Z"),
        atividade("a3", "call", "2026-11-16T12:00:00Z"),
      ],
    );

    expect(itens.map((i) => [i.id, i.system])).toEqual([
      ["a1", true],
      ["a2", true],
      ["a3", false],
    ]);
  });

  it("junta notas e atividades da mais recente para a mais antiga", () => {
    const itens = montarLinhaDoTempo(
      [nota("n1", "2026-11-10T12:00:00Z"), nota("n2", "2026-11-18T09:00:00Z")],
      [atividade("a1", "call", "2026-11-12T12:00:00Z")],
    );

    expect(itens.map((i) => i.id)).toEqual(["n2", "a1", "n1"]);
  });

  it("nota vira item de nota, com o nome de quem escreveu", () => {
    const [item] = montarLinhaDoTempo([nota("n1", "2026-11-10T12:00:00Z")], []);

    expect(item).toEqual({
      id: "n1",
      kind: "note",
      type: "note",
      body: "nota n1",
      occurredAt: "2026-11-10T12:00:00Z",
      authorId: "u1",
      authorName: "Ana Lima",
      system: false,
    });
  });

  it("sem nome, o autor aparece pelo e-mail; sem autor, nulo", () => {
    const itens = montarLinhaDoTempo(
      [{ ...nota("n1", "2026-11-10T12:00:00Z"), author: { full_name: null, email: "x@y.z" } }],
      [{ ...atividade("a1", "call", "2026-11-09T12:00:00Z"), description: null }],
    );

    expect(itens.map((i) => [i.authorName, i.body])).toEqual([
      ["x@y.z", "nota n1"],
      [null, ""],
    ]);
  });

  it("depois do Ganho, a nota do lead fica abaixo de virou cliente (§6.2)", () => {
    const itens = montarLinhaDoTempo(
      [nota("n1", "2026-11-10T12:00:00Z")],
      [
        atividade("a1", "stage_change", "2026-11-18T12:00:00.100Z"),
        atividade("a2", "virou_cliente", "2026-11-18T12:00:00.200Z"),
      ],
    );

    expect(itens.map((i) => i.id)).toEqual(["a2", "a1", "n1"]);
  });
});
