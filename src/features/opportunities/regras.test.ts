import { describe, expect, it } from "vitest";

import {
  aoSoltar,
  enderecoDoCartao,
  motivoDaPerda,
  trilhaDoFunil,
} from "./regras";

/**
 * Regras do funil que não dependem do banco.
 *
 * O lead tem tela própria desde 3/out: enquanto está no funil ele não é
 * cliente, e a tela dele não mostra processo nem financeiro. O que decide o
 * que é "no funil" e o que acontece ao sair dele está aqui.
 */

const etapa = (
  id: string,
  position: number,
  terminal: "ganho" | "perdido" | null = null,
) => ({
  id,
  name: id,
  position,
  is_won: terminal === "ganho",
  is_lost: terminal === "perdido",
});

// Fora de ordem de propósito: a trilha ordena, não confia em quem manda.
const FUNIL = [
  etapa("Perdido", 99, "perdido"),
  etapa("Proposta", 2),
  etapa("Novo Lead", 0),
  etapa("Ganho", 98, "ganho"),
  etapa("Reunião", 1),
];

describe("trilhaDoFunil", () => {
  it("mostra só as etapas do meio, em ordem — Ganho e Perdido são botões, não degraus", () => {
    expect(trilhaDoFunil(FUNIL, "Reunião").map((e) => e.name)).toEqual([
      "Novo Lead",
      "Reunião",
      "Proposta",
    ]);
  });

  it("marca o que já passou, onde está e o que falta", () => {
    expect(trilhaDoFunil(FUNIL, "Reunião").map((e) => e.estado)).toEqual([
      "feita",
      "atual",
      "futura",
    ]);
  });

  it("negócio ganho passou por tudo", () => {
    expect(trilhaDoFunil(FUNIL, "Ganho").map((e) => e.estado)).toEqual([
      "feita",
      "feita",
      "feita",
    ]);
  });

  it("negócio perdido não finge saber onde parou", () => {
    // O banco guarda a etapa atual, não a anterior: perdido, a trilha apaga.
    expect(trilhaDoFunil(FUNIL, "Perdido").map((e) => e.estado)).toEqual([
      "futura",
      "futura",
      "futura",
    ]);
  });
});

describe("motivoDaPerda", () => {
  it("motivo da lista vira o texto que fica no negócio", () => {
    expect(motivoDaPerda("preco", "")).toEqual({ ok: true, texto: "Preço" });
  });

  it("o detalhe acompanha o motivo", () => {
    expect(motivoDaPerda("desistiu", "  volta em janeiro  ")).toEqual({
      ok: true,
      texto: "Desistiu ou adiou — volta em janeiro",
    });
  });

  it("sem motivo não perde — é a informação que este botão existe para colher", () => {
    expect(motivoDaPerda("", "qualquer coisa").ok).toBe(false);
    expect(motivoDaPerda(null, null).ok).toBe(false);
    expect(motivoDaPerda("inventado", "").ok).toBe(false);
  });

  it("“Outro” sozinho não diz nada: exige o detalhe", () => {
    expect(motivoDaPerda("outro", " ").ok).toBe(false);
    expect(motivoDaPerda("outro", "mudou de país")).toEqual({
      ok: true,
      texto: "Outro — mudou de país",
    });
  });

  it("detalhe longo demais é recusado", () => {
    expect(motivoDaPerda("preco", "x".repeat(301)).ok).toBe(false);
  });
});

describe("aoSoltar", () => {
  const [perdido, proposta, novo, ganho] = FUNIL;

  it("na mesma coluna, nada acontece", () => {
    expect(aoSoltar({ stage_id: "Novo Lead" }, novo)).toBe("nada");
  });

  it("em outra etapa do meio, move", () => {
    expect(aoSoltar({ stage_id: "Novo Lead" }, proposta)).toBe("mover");
  });

  it("em Ganho, pede a confirmação — o contato vira cliente e não volta", () => {
    expect(aoSoltar({ stage_id: "Novo Lead" }, ganho)).toBe("ganhar");
  });

  it("em Perdido, pede o motivo", () => {
    expect(aoSoltar({ stage_id: "Novo Lead" }, perdido)).toBe("perder");
  });
});

describe("enderecoDoCartao", () => {
  const cartao = { id: "n1", person: { id: "c1" } };

  it("lead abre a tela do lead", () => {
    expect(enderecoDoCartao(cartao, etapa("Novo Lead", 0))).toBe("/crm/n1");
    expect(enderecoDoCartao(cartao, etapa("Perdido", 99, "perdido"))).toBe("/crm/n1");
  });

  it("negócio ganho abre o perfil do cliente", () => {
    expect(enderecoDoCartao(cartao, etapa("Ganho", 98, "ganho"))).toBe("/contatos/c1");
  });

  it("ganho sem contato visível continua abrindo o negócio", () => {
    expect(enderecoDoCartao({ id: "n1", person: null }, etapa("Ganho", 98, "ganho"))).toBe(
      "/crm/n1",
    );
  });
});
