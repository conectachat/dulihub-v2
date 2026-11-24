import { describe, expect, it } from "vitest";

import { CASOS_DE_CONTATO } from "@/lib/contato.casos";

import { CAMPOS_DA_FICHA, fichaDoFormulario } from "./schema";

/**
 * A ficha de cadastro, do formulário para o objeto que o banco recebe.
 *
 * Duas portas usam a mesma tradução: o lead, que precisa preencher tudo
 * (`completa`), e a equipe, que completa aos poucos (`parcial`). O banco
 * confere de novo (0035) — aqui é para o erro aparecer no campo, na hora, e
 * não como uma recusa genérica depois do envio.
 */

const COMPLETA: Record<string, string> = {
  full_name: "  Ana de Teste  ",
  birth_date: "1990-05-20",
  tax_id: "529.982.247-25",
  national_id: "1234567",
  national_id_issuer: "SSP/MA",
  gender: "feminino",
  marital_status: "casado",
  birthplace: "São Luís",
  nationality: "Brasileira",
  email: "ana@example.com",
  phone_country_code: "+55",
  phone: "98999990000",
  address_street: "Rua da Filosofia",
  address_number: "10",
  address_complement: "",
  address_district: "Cohafuma",
  address_city: "São Luís",
  address_state: "MA",
  address_country: "Brasil",
  address_postal_code: "65000-000",
};

type Dependente = [nome: string, relacao: string, nascimento: string, pais: string];

function formulario(campos: Record<string, string>, dependentes: Dependente[] = []) {
  const fd = new FormData();
  for (const [nome, valor] of Object.entries(campos)) fd.set(nome, valor);
  for (const [nome, relacao, nascimento, pais] of dependentes) {
    fd.append("dep_full_name", nome);
    fd.append("dep_relationship", relacao);
    fd.append("dep_birth_date", nascimento);
    fd.append("dep_birth_country", pais);
  }
  return fd;
}

describe("fichaDoFormulario — completa (a porta do lead)", () => {
  it("ficha inteira passa, aparada, com o CPF só em dígitos", () => {
    const r = fichaDoFormulario(formulario(COMPLETA), "completa");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.full_name).toBe("Ana de Teste");
    expect(r.dados.tax_id).toBe("52998224725");
    // Vazio vira nulo: é o que apaga a coluna em vez de gravar "".
    expect(r.dados.address_complement).toBeNull();
    expect(r.dados.dependents).toEqual([]);
  });

  it("os campos são os do banco — a lista fechada da 0035", () => {
    const r = fichaDoFormulario(formulario(COMPLETA), "completa");
    if (!r.ok) throw new Error("devia passar");

    expect(Object.keys(r.dados).sort()).toEqual([...CAMPOS_DA_FICHA, "dependents"].sort());
  });

  it("cada campo que falta é apontado pelo nome", () => {
    const r = fichaDoFormulario(
      formulario({ ...COMPLETA, national_id: "", address_city: "  " }),
      "completa",
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.campos).sort()).toEqual(["address_city", "national_id"]);
  });

  it("o complemento pode ficar em branco", () => {
    const r = fichaDoFormulario(formulario({ ...COMPLETA, address_complement: "" }), "completa");

    expect(r.ok).toBe(true);
  });

  it("o DDI não: sem ele, a mensagem é a mesma do banco", () => {
    const r = fichaDoFormulario(formulario({ ...COMPLETA, phone_country_code: "" }), "completa");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.campos.phone_country_code).toBe("Informe o DDI");
  });

  it("e-mail e telefone vazios dizem cada um a sua frase, não 'Preencha este campo'", () => {
    const r = fichaDoFormulario(formulario({ ...COMPLETA, email: "", phone: "" }), "completa");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.campos.email).toBe("Informe o e-mail");
    expect(r.campos.phone).toBe("Informe o telefone");
  });

  it("DDI sem o mais grava com o mais", () => {
    const r = fichaDoFormulario(formulario({ ...COMPLETA, phone_country_code: "55" }), "completa");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.phone_country_code).toBe("+55");
  });

  it("CPF com dígito errado é recusado no campo", () => {
    const r = fichaDoFormulario(
      formulario({ ...COMPLETA, tax_id: "529.982.247-26" }),
      "completa",
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.campos.tax_id).toMatch(/CPF/);
  });

  it("nascimento no futuro e e-mail torto são recusados", () => {
    const r = fichaDoFormulario(
      formulario({ ...COMPLETA, birth_date: "2999-01-01", email: "ana@" }),
      "completa",
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.campos).sort()).toEqual(["birth_date", "email"]);
  });

  it("CEP brasileiro precisa de 8 dígitos; de outro país, não", () => {
    const curto = fichaDoFormulario(
      formulario({ ...COMPLETA, address_postal_code: "6500" }),
      "completa",
    );
    expect(curto.ok).toBe(false);

    const fora = fichaDoFormulario(
      formulario({
        ...COMPLETA,
        address_country: "Estados Unidos",
        address_postal_code: "32801",
      }),
      "completa",
    );
    expect(fora.ok).toBe(true);
  });

  it("sexo e estado civil fora da lista são recusados", () => {
    const r = fichaDoFormulario(
      formulario({ ...COMPLETA, gender: "x", marital_status: "enrolado" }),
      "completa",
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.campos).sort()).toEqual(["gender", "marital_status"]);
  });
});

describe("fichaDoFormulario — dependentes", () => {
  it("linha preenchida entra, na ordem", () => {
    const r = fichaDoFormulario(
      formulario(COMPLETA, [
        ["João de Teste", "spouse", "1988-02-01", "Brasil"],
        ["Bia de Teste", "child", "2015-01-10", "Brasil"],
      ]),
      "completa",
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.dependents).toEqual([
      {
        full_name: "João de Teste",
        relationship: "spouse",
        birth_date: "1988-02-01",
        birth_country: "Brasil",
      },
      {
        full_name: "Bia de Teste",
        relationship: "child",
        birth_date: "2015-01-10",
        birth_country: "Brasil",
      },
    ]);
  });

  it("linha em branco é ignorada — quem não tem dependente não preenche nada", () => {
    const r = fichaDoFormulario(formulario(COMPLETA, [["", "", "", ""]]), "completa");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.dependents).toEqual([]);
  });

  it("linha começada exige os quatro campos", () => {
    const r = fichaDoFormulario(
      formulario(COMPLETA, [["Bia de Teste", "child", "", ""]]),
      "completa",
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.campos["dependents.0"]).toBeTruthy();
  });

  it("mais de 10 é recusado — o mesmo teto do banco", () => {
    const r = fichaDoFormulario(
      formulario(
        COMPLETA,
        Array.from({ length: 11 }, (): Dependente => ["Filho", "child", "2015-01-10", "Brasil"]),
      ),
      "completa",
    );

    expect(r.ok).toBe(false);
  });
});

describe("fichaDoFormulario — parcial (a porta da equipe)", () => {
  it("só o nome não basta: e-mail, DDI e telefone também são obrigatórios", () => {
    const r = fichaDoFormulario(formulario({ full_name: "Ana" }), "parcial");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.campos.email).toBe("Informe o e-mail");
    expect(r.campos.tax_id).toBeUndefined();
  });

  it("nome e contato bastam; o resto pode ficar em branco", () => {
    const r = fichaDoFormulario(
      formulario({
        full_name: "Ana",
        email: "ana@example.com",
        phone_country_code: "+55",
        phone: "98999990000",
      }),
      "parcial",
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.full_name).toBe("Ana");
    expect(r.dados.tax_id).toBeNull();
  });

  it.each(CASOS_DE_CONTATO)("a regra comum: $nome", (c) => {
    const r = fichaDoFormulario(
      formulario({
        full_name: "Ana",
        email: c.contato.email ?? "",
        phone_country_code: c.contato.ddi ?? "",
        phone: c.contato.telefone ?? "",
      }),
      "parcial",
    );

    const campo = { email: "email", ddi: "phone_country_code", telefone: "phone" } as const;
    const erro = r.ok
      ? null
      : (r.campos[campo.email] ?? r.campos[campo.ddi] ?? r.campos[campo.telefone] ?? null);
    expect(erro).toBe(c.erro);
  });

  it("sem nome, recusa", () => {
    const r = fichaDoFormulario(formulario({ full_name: " " }), "parcial");

    expect(r.ok).toBe(false);
  });

  it("o que foi preenchido ainda precisa estar certo", () => {
    const r = fichaDoFormulario(
      formulario({ full_name: "Ana", tax_id: "123" }),
      "parcial",
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.campos.tax_id).toMatch(/CPF/);
  });
});

describe("fichaDoFormulario — sem contato (cliente de parceiro, PAR-7)", () => {
  // O cliente de parceiro não tem contato próprio: a ficha não cobra nem
  // leva as três chaves. Chave com nulo ainda conta para `salvar_cadastro`
  // (0040), por isso elas saem do objeto.
  it("não leva e-mail, DDI nem telefone, e não confere contato", () => {
    const r = fichaDoFormulario(
      formulario({ full_name: "Fulano de Tal", email: "x", phone: "1" }),
      "parcial",
      undefined,
      { semContato: true },
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.full_name).toBe("Fulano de Tal");
    expect(r.dados).not.toHaveProperty("email");
    expect(r.dados).not.toHaveProperty("phone_country_code");
    expect(r.dados).not.toHaveProperty("phone");
  });
});
