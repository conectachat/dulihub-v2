import { describe, expect, it } from "vitest";

import { CASOS_DE_CONTATO } from "@/lib/contato.casos";

import { personFromForm, personSchema } from "./schema";

/**
 * Este arquivo existe por causa de um defeito que passou dois dias em pé:
 * **criar e editar contato nunca funcionou.**
 *
 * A ação montava o objeto com `notes: formData.get("notes")`, e o formulário
 * nunca teve esse campo — `formData.get` devolve `null` para campo inexistente,
 * e `.optional()` do zod aceita `undefined`, não `null`. Toda gravação parava
 * na validação, e a tela mostrava, em inglês, *"Invalid input: expected string,
 * received null"*.
 *
 * Ninguém percebeu porque os 76 contatos vieram do script de importação, que
 * escreve direto no banco sem passar por aqui.
 *
 * Daí a forma destes testes: montam um `FormData` **com os mesmos `name` da
 * tela**, em vez do objeto ideal que a gente imagina que ela envia.
 *
 * Desde 17/nov, nome, e-mail, DDI e telefone são obrigatórios (CON-4, spec
 * §6.1). A regra de formato é a de `src/lib/contato.ts`, a mesma do banco.
 */

/** Exatamente os campos que `person-dialog.tsx` tem, e nada além. */
function formularioDaTela(sobrescreve: Record<string, string> = {}) {
  const fd = new FormData();
  const campos = {
    full_name: "Renata Carneiro",
    email: "renata@example.com",
    phone_country_code: "+55",
    phone: "31 99999-0000",
    company: "",
    job_title: "",
    ...sobrescreve,
  };
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

describe("personFromForm", () => {
  it("aceita o formulário como a tela o envia", () => {
    const r = personFromForm(formularioDaTela());
    expect(r.success).toBe(true);
  });

  it("só o nome não basta: e-mail e telefone também são obrigatórios", () => {
    const fd = new FormData();
    fd.set("full_name", "Joyce Morisco");
    const r = personFromForm(fd);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Informe o e-mail");
  });

  it("exige o nome, com mensagem em português", () => {
    const r = personFromForm(formularioDaTela({ full_name: "   " }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Informe o nome");
  });

  it("recusa e-mail malformado, com mensagem em português", () => {
    const r = personFromForm(formularioDaTela({ email: "arroba-faltando" }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe("E-mail inválido");
      expect(r.error.issues[0].path).toEqual(["email"]);
    }
  });

  it("apagar o e-mail é recusado, no campo do e-mail", () => {
    const r = personFromForm(formularioDaTela({ email: "" }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe("Informe o e-mail");
      expect(r.error.issues[0].path).toEqual(["email"]);
    }
  });

  it("apagar o telefone é recusado, no campo do telefone", () => {
    const r = personFromForm(formularioDaTela({ phone: "" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["phone"]);
  });

  it("apagar empresa e cargo grava null em vez de sumir do envio", () => {
    // O segundo defeito: `""` virava `undefined`, a chave sumia do objeto, e
    // chave ausente num PATCH quer dizer "não mexa nesta coluna". O valor
    // antigo continuava no banco enquanto a tela dizia que salvou.
    const r = personFromForm(formularioDaTela({ company: "", job_title: "" }));
    expect(r.success).toBe(true);
    if (r.success) {
      expect("company" in r.data).toBe(true);
      expect(r.data.company).toBeNull();
      expect(r.data.job_title).toBeNull();
    }
  });

  it("tira espaço das pontas e grava o DDI com o mais", () => {
    const r = personFromForm(
      formularioDaTela({
        full_name: "  Renata  ",
        company: " Duli ",
        email: " renata@example.com ",
        phone_country_code: "55",
      }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.full_name).toBe("Renata");
      expect(r.data.company).toBe("Duli");
      expect(r.data.email).toBe("renata@example.com");
      expect(r.data.phone_country_code).toBe("+55");
    }
  });

  it.each(CASOS_DE_CONTATO)("a regra comum: $nome", (c) => {
    const r = personFromForm(
      formularioDaTela({
        email: c.contato.email ?? "",
        phone_country_code: c.contato.ddi ?? "",
        phone: c.contato.telefone ?? "",
      }),
    );
    expect(r.success ? null : r.error.issues[0].message).toBe(c.erro);
  });
});

describe("personSchema", () => {
  it("recusa objeto só com o nome", () => {
    expect(personSchema.safeParse({ full_name: "Samara Alves" }).success).toBe(false);
  });

  it("aceita null em empresa e cargo", () => {
    const r = personSchema.safeParse({
      full_name: "Rebeca Dias",
      email: "rebeca@example.com",
      phone_country_code: "+55",
      phone: "31999990000",
      company: null,
      job_title: null,
    });
    expect(r.success).toBe(true);
  });
});
