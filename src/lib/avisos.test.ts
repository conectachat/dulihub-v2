import { describe, expect, it } from "vitest";

import { avisoDeExclusaoDePasta, listarNomes } from "./avisos";

/**
 * O texto do aviso de exclusão é a única coisa entre um clique e a perda de
 * configuração que levou tempo para montar. Ele erra de dois jeitos: dizendo
 * menos do que se perde, e dizendo "as 1 pastas".
 */

describe("listarNomes", () => {
  it("devolve vazio para lista vazia", () => {
    expect(listarNomes([])).toBe("");
  });

  it("não põe conectivo quando é um só", () => {
    expect(listarNomes(["EB-1A"])).toBe("EB-1A");
  });

  it("liga os dois últimos com “e”, não com vírgula", () => {
    expect(listarNomes(["EB-1A", "NIW"])).toBe("EB-1A e NIW");
    expect(listarNomes(["EB-1A", "NIW", "O-1"])).toBe("EB-1A, NIW e O-1");
  });

  it("corta a lista longa em vez de estourar o diálogo", () => {
    expect(listarNomes(["a", "b", "c", "d"])).toBe("a, b, c e mais 1");
    expect(listarNomes(["a", "b", "c", "d", "e"])).toBe("a, b, c e mais 2");
  });
});

describe("avisoDeExclusaoDePasta", () => {
  it("avisa que não há volta, mesmo quando nada mais se perde", () => {
    const aviso = avisoDeExclusaoDePasta({ pastas: 0, vistos: [] });
    expect(aviso).toBe("Não dá para desfazer.");
  });

  it("concorda o número com o substantivo", () => {
    expect(avisoDeExclusaoDePasta({ pastas: 1, vistos: [] })).toBe(
      "Isso apaga também a pasta que está dentro dela. Não dá para desfazer.",
    );
    expect(avisoDeExclusaoDePasta({ pastas: 3, vistos: [] })).toBe(
      "Isso apaga também as 3 pastas que estão dentro dela. Não dá para desfazer.",
    );
  });

  it("nomeia o visto que perde a exigência", () => {
    const aviso = avisoDeExclusaoDePasta({ pastas: 0, vistos: ["EB-1A"] });
    expect(aviso).toContain("EB-1A");
    expect(aviso).toContain("prazo");
    expect(aviso).toContain("Não dá para desfazer.");
  });

  it("conta os vistos no plural quando são vários", () => {
    const aviso = avisoDeExclusaoDePasta({
      pastas: 0,
      vistos: ["EB-1A", "NIW"],
    });
    expect(aviso).toContain("2 tipos de visto");
    expect(aviso).toContain("EB-1A e NIW");
  });

  it("junta as duas perdas numa frase só", () => {
    const aviso = avisoDeExclusaoDePasta({ pastas: 2, vistos: ["EB-1A"] });
    expect(aviso).toContain("2 pastas");
    expect(aviso).toContain("EB-1A");
    expect(aviso.endsWith("Não dá para desfazer.")).toBe(true);
  });
});
