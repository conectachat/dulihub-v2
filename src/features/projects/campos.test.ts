import { describe, expect, it } from "vitest";

import {
  campoDaEtapa,
  campoDoProcesso,
  datasDaEtapa,
  numeracao,
  resumoDasFilhas,
} from "./campos";

/**
 * Edição no lugar dos dados do processo, um campo por vez.
 *
 * A ação recebe o nome do campo vindo do navegador: sem lista fechada, um
 * formulário adulterado gravaria `organization_id` ou `person_id` pelo mesmo
 * caminho. Daí o primeiro teste.
 */

describe("campoDoProcesso", () => {
  it("recusa campo fora da lista", () => {
    for (const campo of ["organization_id", "person_id", "title; drop", ""]) {
      expect(campoDoProcesso(campo, "x").ok).toBe(false);
    }
  });

  describe("recibo do USCIS", () => {
    it("normaliza: maiúsculas, sem espaço nem hífen", () => {
      expect(campoDoProcesso("uscis_receipt_number", " ioe-091 234 5678 ")).toEqual({
        ok: true,
        campo: "uscis_receipt_number",
        valor: "IOE0912345678",
      });
    });

    it("exige três letras e dez dígitos", () => {
      // Recibo errado é pior que recibo nenhum: é com ele que se consulta o
      // caso no site do USCIS.
      const r = campoDoProcesso("uscis_receipt_number", "IOE12345");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.erro).toMatch(/3 letras e 10 números/);
    });

    it("vazio apaga", () => {
      expect(campoDoProcesso("uscis_receipt_number", "  ")).toEqual({
        ok: true,
        campo: "uscis_receipt_number",
        valor: null,
      });
    });
  });

  describe("datas", () => {
    it.each([
      "priority_date",
      "filed_on",
      "rfe_received_on",
      "rfe_due_on",
      "decided_on",
      "expected_on",
    ])("%s aceita AAAA-MM-DD e vazio", (campo) => {
      expect(campoDoProcesso(campo, "2026-09-18")).toEqual({
        ok: true,
        campo,
        valor: "2026-09-18",
      });
      expect(campoDoProcesso(campo, "")).toMatchObject({ ok: true, valor: null });
    });

    it("recusa data que não existe", () => {
      expect(campoDoProcesso("filed_on", "2026-02-30").ok).toBe(false);
      expect(campoDoProcesso("filed_on", "18/09/2026").ok).toBe(false);
    });
  });

  describe("status", () => {
    it("aceita os do banco", () => {
      expect(campoDoProcesso("status", "filed")).toEqual({
        ok: true,
        campo: "status",
        valor: "filed",
      });
    });

    it("recusa os outros, e não aceita vazio", () => {
      expect(campoDoProcesso("status", "arquivado").ok).toBe(false);
      expect(campoDoProcesso("status", "").ok).toBe(false);
    });
  });
});

describe("datasDaEtapa", () => {
  const HOJE = "2026-09-18";
  const pendente = { is_default: true, is_done: false };
  const andamento = { is_default: false, is_done: false };
  const concluida = { is_default: false, is_done: true };

  it("sair do padrão marca o início hoje", () => {
    expect(
      datasDaEtapa(andamento, { started_on: null, completed_on: null }, HOJE),
    ).toEqual({ started_on: HOJE, completed_on: null });
  });

  it("não reescreve um início que já existe", () => {
    expect(
      datasDaEtapa(
        andamento,
        { started_on: "2026-09-01", completed_on: null },
        HOJE,
      ),
    ).toEqual({ started_on: "2026-09-01", completed_on: null });
  });

  it("concluir marca a conclusão, e o início se faltava", () => {
    expect(
      datasDaEtapa(concluida, { started_on: null, completed_on: null }, HOJE),
    ).toEqual({ started_on: HOJE, completed_on: HOJE });
  });

  it("reabrir apaga a conclusão e mantém o início", () => {
    expect(
      datasDaEtapa(
        andamento,
        { started_on: "2026-09-01", completed_on: "2026-09-10" },
        HOJE,
      ),
    ).toEqual({ started_on: "2026-09-01", completed_on: null });
  });

  it("voltar ao padrão zera as duas datas", () => {
    // Voltar para "pendente" é desfazer: a etapa não começou.
    expect(
      datasDaEtapa(
        pendente,
        { started_on: "2026-09-01", completed_on: "2026-09-10" },
        HOJE,
      ),
    ).toEqual({ started_on: null, completed_on: null });
  });
});

describe("campoDaEtapa", () => {
  it("recusa campo fora da lista", () => {
    for (const campo of ["project_id", "organization_id", "status_id", ""]) {
      expect(campoDaEtapa(campo, "x").ok).toBe(false);
    }
  });

  it("data prevista aceita data e vazio", () => {
    expect(campoDaEtapa("due_on", "2026-10-01")).toEqual({
      ok: true,
      campo: "due_on",
      valor: "2026-10-01",
    });
    expect(campoDaEtapa("due_on", "")).toMatchObject({ ok: true, valor: null });
    expect(campoDaEtapa("due_on", "2026-13-01").ok).toBe(false);
  });

  it("data de conclusão não pode ser apagada à mão", () => {
    // Apagar a conclusão é reabrir a etapa — isso se faz trocando o status,
    // senão a etapa ficaria "Concluída" sem data.
    expect(campoDaEtapa("completed_on", "2026-09-10")).toMatchObject({ ok: true });
    expect(campoDaEtapa("completed_on", "").ok).toBe(false);
  });

  it("nome é obrigatório e vem aparado", () => {
    expect(campoDaEtapa("name", "  Análise  ")).toEqual({
      ok: true,
      campo: "name",
      valor: "Análise",
    });
    expect(campoDaEtapa("name", "   ").ok).toBe(false);
  });
});

describe("numeracao", () => {
  it("numera como índice: 1, 1.1, 1.2, 2", () => {
    const arvore = [
      { id: "a", depth: 0 },
      { id: "a1", depth: 1 },
      { id: "a2", depth: 1 },
      { id: "a2x", depth: 2 },
      { id: "b", depth: 0 },
      { id: "b1", depth: 1 },
    ];
    expect(Object.fromEntries(numeracao(arvore))).toEqual({
      a: "1",
      a1: "1.1",
      a2: "1.2",
      a2x: "1.2.1",
      b: "2",
      b1: "2.1",
    });
  });
});

describe("resumoDasFilhas", () => {
  it("conta as filhas diretas concluídas de cada mãe", () => {
    const etapas = [
      { id: "a", parent_id: null, status_id: "feito" },
      { id: "a1", parent_id: "a", status_id: "feito" },
      { id: "a2", parent_id: "a", status_id: "pendente" },
      { id: "a3", parent_id: "a", status_id: "feito" },
      { id: "b", parent_id: null, status_id: "pendente" },
    ];
    const resumo = resumoDasFilhas(etapas, new Set(["feito"]));
    expect(resumo.get("a")).toEqual({ concluidas: 2, total: 3 });
    // Sem filhas, sem contador.
    expect(resumo.has("b")).toBe(false);
  });
});
