import { describe, expect, it } from "vitest";

import { campoDoProcesso, datasDaEtapa } from "./campos";

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
