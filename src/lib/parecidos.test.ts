import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { buscarParecidos, contatoMudou, respostaDaCriacao, respostaDoNovoCliente } from "./parecidos";
import type { Database } from "./supabase/database.types";

/**
 * O aviso "já cadastrado" (CON-4) depende de duas traduções: a da RPC
 * `contatos_parecidos` para o que a tela mostra, e a de "o contato mudou?" na
 * edição — só redigitar a máscara do telefone não pode disparar o aviso.
 */

function clienteFalso(resposta: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => resposta);
  // Só `rpc` existe aqui; o resto do cliente não é usado por buscarParecidos.
  return { cliente: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

describe("buscarParecidos", () => {
  it("traduz as linhas da RPC", async () => {
    const { cliente, rpc } = clienteFalso({
      data: [
        {
          id: "p1",
          full_name: "Carlos Souza",
          lifecycle_stage: "client",
          na_lixeira: false,
          bate_email: true,
          bate_telefone: false,
        },
      ],
      error: null,
    });

    const r = await buscarParecidos(cliente, {
      email: "carlos@x.co",
      ddi: "+55",
      telefone: "31999990000",
      ignorar: "p9",
    });

    expect(r).toEqual({
      error: null,
      parecidos: [
        {
          id: "p1",
          nome: "Carlos Souza",
          estagio: "client",
          naLixeira: false,
          bateEmail: true,
          bateTelefone: false,
        },
      ],
    });
    expect(rpc).toHaveBeenCalledWith("contatos_parecidos", {
      p_email: "carlos@x.co",
      p_ddi: "+55",
      p_telefone: "31999990000",
      p_ignorar: "p9",
    });
  });

  it("campo vazio vai como texto vazio, e sem ignorar não manda a chave", async () => {
    const { cliente, rpc } = clienteFalso({ data: [], error: null });

    await buscarParecidos(cliente, { email: null, ddi: "+55", telefone: "31999990000" });

    expect(rpc).toHaveBeenCalledWith("contatos_parecidos", {
      p_email: "",
      p_ddi: "+55",
      p_telefone: "31999990000",
    });
  });

  it("falha da RPC vira frase, sem lista", async () => {
    const { cliente } = clienteFalso({
      data: null,
      error: { code: "42501", message: "permission denied for function contatos_parecidos" },
    });

    const r = await buscarParecidos(cliente, { email: "a@b.co", ddi: "+55", telefone: "31999990000" });

    expect(r.parecidos).toEqual([]);
    expect(r.error).toBeTruthy();
    expect(r.error).not.toContain("permission denied");
  });
});

describe("respostaDaCriacao", () => {
  it("respostaDaCriacao traduz as duas situações e recusa formato desconhecido", () => {
    expect(
      respostaDaCriacao.parse({ situacao: "criada", negocio: "n1", pessoa: "p1" }),
    ).toEqual({ situacao: "criada", negocio: "n1", pessoa: "p1" });

    expect(
      respostaDaCriacao.parse({
        situacao: "precisa_confirmar",
        parecidos: [
          {
            id: "p1",
            nome: "Carlos Souza",
            estagio: "client",
            na_lixeira: true,
            bate_email: false,
            bate_telefone: true,
          },
        ],
      }),
    ).toEqual({
      situacao: "precisa_confirmar",
      parecidos: [
        {
          id: "p1",
          nome: "Carlos Souza",
          estagio: "client",
          naLixeira: true,
          bateEmail: false,
          bateTelefone: true,
        },
      ],
      oportunidades: [],
    });

    expect(
      respostaDaCriacao.parse({
        situacao: "precisa_confirmar",
        oportunidades: [
          { id: "n1", titulo: "EB-2 NIW", status: "won", criada_em: "2026-10-01T12:00:00+00:00" },
        ],
      }),
    ).toEqual({
      situacao: "precisa_confirmar",
      parecidos: [],
      oportunidades: [
        { id: "n1", titulo: "EB-2 NIW", status: "won", criadaEm: "2026-10-01T12:00:00+00:00" },
      ],
    });

    expect(respostaDaCriacao.safeParse({ situacao: "outra" }).success).toBe(false);
    expect(respostaDaCriacao.safeParse(null).success).toBe(false);
  });
});

describe("contatoMudou", () => {
  it("redigitar a máscara, a maiúscula ou o '+' do DDI não conta", () => {
    expect(
      contatoMudou(
        { email: " Ana@X.co ", ddi: "55", telefone: "(31) 99999-0000" },
        { email: "ana@x.co", ddi: "+55", telefone: "31999990000" },
      ),
    ).toBe(false);
  });

  it("outro telefone, outro e-mail ou outro DDI contam", () => {
    const antes = { email: "ana@x.co", ddi: "+55", telefone: "31999990000" };
    expect(contatoMudou(antes, { ...antes, telefone: "31888880000" })).toBe(true);
    expect(contatoMudou(antes, { ...antes, email: "ana2@x.co" })).toBe(true);
    expect(contatoMudou(antes, { ...antes, ddi: "+1" })).toBe(true);
  });

  it("contato antigo sem e-mail que ganha um conta", () => {
    expect(
      contatoMudou(
        { email: null, ddi: "+55", telefone: "31999990000" },
        { email: "ana@x.co", ddi: "+55", telefone: "31999990000" },
      ),
    ).toBe(true);
  });
});

describe("respostaDoNovoCliente", () => {
  it("lê o criado", () => {
    expect(respostaDoNovoCliente.parse({ situacao: "criado", pessoa: "p1" })).toEqual({
      situacao: "criado",
      pessoa: "p1",
    });
  });

  it("lê os parecidos, com outra_organizacao virando outraOrganizacao", () => {
    expect(
      respostaDoNovoCliente.parse({
        situacao: "precisa_confirmar",
        parecidos: [
          {
            id: "p1",
            nome: "Ana",
            estagio: "contact",
            na_lixeira: false,
            bate_email: true,
            bate_telefone: false,
            outra_organizacao: true,
          },
        ],
      }),
    ).toEqual({
      situacao: "precisa_confirmar",
      parecidos: [
        {
          id: "p1",
          nome: "Ana",
          estagio: "contact",
          naLixeira: false,
          bateEmail: true,
          bateTelefone: false,
          outraOrganizacao: true,
        },
      ],
    });
  });
});
