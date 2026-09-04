import { describe, expect, it } from "vitest";

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
 */

/** Exatamente os campos que `person-dialog.tsx` tem, e nada além. */
function formularioDaTela(sobrescreve: Record<string, string> = {}) {
  const fd = new FormData();
  const campos = {
    full_name: "Renata Carneiro",
    email: "",
    phone_country_code: "+55",
    phone: "",
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

  it("aceita o mínimo: só o nome preenchido", () => {
    const fd = new FormData();
    fd.set("full_name", "Joyce Morisco");
    const r = personFromForm(fd);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBeNull();
  });

  it("exige o nome, com mensagem em português", () => {
    const r = personFromForm(formularioDaTela({ full_name: "   " }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Informe o nome");
  });

  it("recusa email malformado, com mensagem em português", () => {
    const r = personFromForm(formularioDaTela({ email: "arroba-faltando" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Email inválido");
  });

  it("apagar o email grava null em vez de sumir do envio", () => {
    // O segundo defeito: `""` virava `undefined`, a chave sumia do objeto, e
    // chave ausente num PATCH quer dizer "não mexa nesta coluna". O endereço
    // antigo continuava no banco enquanto a tela dizia que salvou.
    const r = personFromForm(formularioDaTela({ email: "" }));
    expect(r.success).toBe(true);
    if (r.success) {
      expect("email" in r.data).toBe(true);
      expect(r.data.email).toBeNull();
    }
  });

  it("apagar telefone, empresa e cargo também grava null", () => {
    const r = personFromForm(
      formularioDaTela({ phone: "", company: "", job_title: "" }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.phone).toBeNull();
      expect(r.data.company).toBeNull();
      expect(r.data.job_title).toBeNull();
    }
  });

  it("tira espaço das pontas", () => {
    const r = personFromForm(
      formularioDaTela({ full_name: "  Renata  ", company: " Duli " }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.full_name).toBe("Renata");
      expect(r.data.company).toBe("Duli");
    }
  });
});

describe("personSchema", () => {
  it("não recusa objeto sem as chaves opcionais", () => {
    // Blindagem contra a volta do defeito por outro caminho: qualquer campo
    // opcional ausente tem de ser aceito, venha como `null` ou não venha.
    expect(personSchema.safeParse({ full_name: "Samara Alves" }).success).toBe(true);
  });

  it("aceita null em qualquer campo opcional", () => {
    const r = personSchema.safeParse({
      full_name: "Rebeca Dias",
      email: null,
      phone_country_code: null,
      phone: null,
      company: null,
      job_title: null,
    });
    expect(r.success).toBe(true);
  });
});
