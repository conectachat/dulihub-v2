import { describe, expect, it } from "vitest";

import { contatoNovoDoFormulario, erroDeContato, normalizarDdi } from "./contato";
import { CASOS_DE_CONTATO } from "./contato.casos";

/**
 * Todo contato tem e-mail, DDI e telefone (CON-8). A regra existe duas vezes —
 * aqui e em `private.contato_valido` — e a lista de casos é a mesma nas duas.
 */
describe("erroDeContato", () => {
  it.each(CASOS_DE_CONTATO)("$nome", (c) => {
    expect(erroDeContato(c.contato)?.mensagem ?? null).toBe(c.erro);
  });

  it("aponta o campo que falhou", () => {
    const porNome = (nome: string) => CASOS_DE_CONTATO.find((c) => c.nome === nome)!.contato;
    expect(erroDeContato(porNome("sem e-mail"))?.campo).toBe("email");
    expect(erroDeContato(porNome("sem DDI"))?.campo).toBe("ddi");
    expect(erroDeContato(porNome("sem telefone"))?.campo).toBe("telefone");
  });

  it("confere na ordem e-mail → DDI → telefone", () => {
    expect(erroDeContato({ email: null, ddi: null, telefone: null })?.campo).toBe("email");
    expect(erroDeContato({ email: "a@b.co", ddi: null, telefone: null })?.campo).toBe("ddi");
  });
});

describe("normalizarDdi", () => {
  it("põe o mais e apara", () => {
    expect(normalizarDdi("55")).toBe("+55");
    expect(normalizarDdi(" +1 ")).toBe("+1");
  });

  it("vazio vira nulo", () => {
    expect(normalizarDdi("")).toBeNull();
    expect(normalizarDdi(null)).toBeNull();
  });

  it("fora do formato volta como veio (o erro sai de erroDeContato)", () => {
    expect(normalizarDdi("+5a")).toBe("+5a");
  });
});

describe("contatoNovoDoFormulario", () => {
  function formulario(campos: Record<string, string>) {
    const fd = new FormData();
    for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
    return fd;
  }

  const valido = {
    novo_full_name: "  Maria Souza ",
    novo_email: "maria@exemplo.com",
    novo_phone_country_code: "55",
    novo_phone: "(31) 99999-0000",
  };

  it("lê os quatro campos novo_*, apara o nome e normaliza o DDI", () => {
    expect(contatoNovoDoFormulario(formulario(valido))).toEqual({
      ok: true,
      contato: {
        full_name: "Maria Souza",
        email: "maria@exemplo.com",
        phone_country_code: "+55",
        phone: "(31) 99999-0000",
      },
    });
  });

  it("sem nome: Informe o nome", () => {
    expect(contatoNovoDoFormulario(formulario({ ...valido, novo_full_name: "  " }))).toEqual({
      ok: false,
      erro: "Informe o nome",
    });
  });

  it("e-mail inválido: a frase de erroDeContato", () => {
    expect(contatoNovoDoFormulario(formulario({ ...valido, novo_email: "sem-arroba" }))).toEqual({
      ok: false,
      erro: "E-mail inválido",
    });
  });
});
