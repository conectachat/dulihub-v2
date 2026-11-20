// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  destinoDoContato,
  destinoDoPerfil,
  enderecoDaPessoa,
  enderecoDoNovoCliente,
  NOVO_PROCESSO_SEM_NEGOCIO,
} from "./pessoa";

/**
 * Para onde vai o link de uma pessoa (CLI-2, CLI-3).
 *
 * Cliente mora em `/clientes/<id>`, com abas; quem não é cliente, no perfil
 * enxuto de `/contatos/<id>`. As duas rotas decidem **só** pelo estágio: a
 * lixeira não muda o endereço, senão o cliente excluído cairia num laço de
 * redirecionamento ou num "não encontrado".
 */

const ID = "11111111-1111-4111-8111-111111111111";

describe("enderecoDaPessoa", () => {
  it("cliente vai para o perfil de cliente, na aba pedida", () => {
    expect(enderecoDaPessoa(ID, "client")).toBe(`/clientes/${ID}`);
    expect(enderecoDaPessoa(ID, "client", "projetos")).toBe(`/clientes/${ID}?aba=projetos`);
    expect(enderecoDaPessoa(ID, "client", "dados")).toBe(`/clientes/${ID}?aba=dados`);
  });

  it("quem não é cliente vai para o perfil enxuto; os dados cadastrais pela âncora", () => {
    expect(enderecoDaPessoa(ID, "opportunity")).toBe(`/contatos/${ID}`);
    expect(enderecoDaPessoa(ID, "contact", "dados")).toBe(`/contatos/${ID}#dados-cadastrais`);
    // O perfil enxuto não tem abas: projetos e financeiro não existem lá.
    expect(enderecoDaPessoa(ID, "opportunity", "projetos")).toBe(`/contatos/${ID}`);
  });
});

describe("destinoDoContato", () => {
  it("leva a query junto", () => {
    expect(destinoDoContato(ID, { x: "1" })).toBe(`/clientes/${ID}?x=1`);
    expect(destinoDoContato(ID, {})).toBe(`/clientes/${ID}`);
  });

  it("parâmetro repetido continua repetido", () => {
    expect(destinoDoContato(ID, { t: ["a", "b"] })).toBe(`/clientes/${ID}?t=a&t=b`);
  });

  it("o atalho de novo processo abre a aba Projetos", () => {
    expect(destinoDoContato(ID, { "novo-processo": "n1" })).toBe(
      `/clientes/${ID}?aba=projetos&novo-processo=n1`,
    );
    // O atalho manda na aba, mesmo que outra tenha vindo junto.
    expect(destinoDoContato(ID, { aba: "notas", "novo-processo": "n1" })).toBe(
      `/clientes/${ID}?aba=projetos&novo-processo=n1`,
    );
  });
});

describe("destinoDoPerfil", () => {
  it("cliente fica no perfil de cliente, também na lixeira", () => {
    expect(destinoDoPerfil({ id: ID, lifecycle_stage: "client", deleted_at: null })).toBeNull();
    expect(
      destinoDoPerfil({ id: ID, lifecycle_stage: "client", deleted_at: "2026-11-01T10:00:00Z" }),
    ).toBeNull();
  });

  it("quem não é cliente volta para o perfil de contato", () => {
    expect(destinoDoPerfil({ id: ID, lifecycle_stage: "opportunity", deleted_at: null })).toBe(
      `/contatos/${ID}`,
    );
  });
});

describe("enderecoDoNovoCliente", () => {
  it("abre o perfil na aba Projetos com o + Novo processo aberto e sem negócio", () => {
    expect(NOVO_PROCESSO_SEM_NEGOCIO).toBe("novo");
    expect(enderecoDoNovoCliente("p1")).toBe("/clientes/p1?aba=projetos&novo-processo=novo");
  });
});
