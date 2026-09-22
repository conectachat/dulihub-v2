// @vitest-environment node

import { describe, expect, it } from "vitest";

import { coalescerOrdem, novaOrdem } from "./ordem";
import type { ItemDaFila } from "./fila";

/**
 * Reordenar de um jeito que aguenta ser repetido.
 *
 * `swap_positions` troca duas linhas de lugar, e isso não é idempotente:
 * repetir a mesma troca **desfaz**, e duas trocas reproduzidas fora de ordem
 * deixam a lista errada sem erro nenhum. Numa fila que sobe depois de horas
 * offline, é exatamente o que aconteceria. Por isso a fila manda a ordem
 * final inteira (`reordenar_irmaos`, 0030), e o que se calcula aqui é essa
 * lista.
 */

const irmaos = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("novaOrdem", () => {
  it("subir troca com quem está acima", () => {
    expect(novaOrdem(irmaos, "b", "up")).toEqual(["b", "a", "c"]);
  });

  it("descer troca com quem está abaixo", () => {
    expect(novaOrdem(irmaos, "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("subir o primeiro e descer o último não mudam nada", () => {
    expect(novaOrdem(irmaos, "a", "up")).toEqual(["a", "b", "c"]);
    expect(novaOrdem(irmaos, "c", "down")).toEqual(["a", "b", "c"]);
  });

  it("id que não está na lista devolve a lista como está", () => {
    expect(novaOrdem(irmaos, "z", "up")).toEqual(["a", "b", "c"]);
  });

  it("repetir a mesma lista não muda nada — é o ponto de tudo isto", () => {
    const uma = novaOrdem(irmaos, "b", "up");
    const outra = novaOrdem(
      uma.map((id) => ({ id })),
      "b",
      "up",
    );
    expect(outra).toEqual(uma);
  });
});

function item(id: string, args: Record<string, unknown>): ItemDaFila {
  return {
    id,
    alvo: `reordenar:${args.p_tabela}:${args.p_pai ?? "raiz"}`,
    depende: [],
    passos: [{ tipo: "rpc", nome: "reordenar_irmaos", args }],
    rotulo: "Reordenar",
    criada_em: `2026-09-21T10:00:0${id}Z`,
    estado: "pendente",
    enviada_em: null,
    motivo: null,
  };
}

describe("coalescerOrdem", () => {
  it("reordenação do mesmo grupo substitui a anterior", () => {
    // Dez cliques offline viram uma chamada só, com a ordem final. Empilhar
    // dez seria mandar nove ordens que já não valem.
    const antigo = item("1", { p_tabela: "document_types", p_pai: "x", p_ids: ["a", "b"] });

    expect(coalescerOrdem([antigo], "document_types", "x")).toBe(antigo.id);
  });

  it("grupo diferente não é substituído", () => {
    const antigo = item("1", { p_tabela: "document_types", p_pai: "x", p_ids: ["a", "b"] });

    expect(coalescerOrdem([antigo], "document_types", "y")).toBeNull();
    expect(coalescerOrdem([antigo], "visa_stages", "x")).toBeNull();
  });

  it("reordenação já recusada não é substituída — ela espera decisão", () => {
    const recusado = { ...item("1", { p_tabela: "document_types", p_pai: "x", p_ids: ["a"] }), estado: "conflito" as const };

    expect(coalescerOrdem([recusado], "document_types", "x")).toBeNull();
  });

  it("item que não é reordenação é ignorado", () => {
    const outro: ItemDaFila = {
      ...item("1", {}),
      passos: [{ tipo: "delete", tabela: "document_types", id: "a" }],
    };

    expect(coalescerOrdem([outro], "document_types", "x")).toBeNull();
  });
});
