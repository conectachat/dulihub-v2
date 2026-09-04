import { describe, expect, it } from "vitest";

import { traduzirErro } from "./erros";

/**
 * As três cópias antigas casavam **substring de mensagem** — uma delas com a
 * palavra `"fábrica"`. Reescrever o texto de um gatilho quebrava a tradução em
 * silêncio, e nenhuma migration avisaria. Estes testes existem para que a
 * ligação entre migration e tela seja verificada, não confiada.
 */

describe("traduzirErro", () => {
  it("mostra a mensagem do gatilho como está — ela já foi escrita em português", () => {
    expect(
      traduzirErro({
        code: "23001",
        message: "Etapa de ganho ou perda não pode ser excluída. Renomeie se precisar.",
      }),
    ).toBe("Etapa de ganho ou perda não pode ser excluída. Renomeie se precisar.");

    expect(
      traduzirErro({
        code: "P0001",
        message: "Essa mudança criaria um ciclo na hierarquia.",
      }),
    ).toBe("Essa mudança criaria um ciclo na hierarquia.");
  });

  it("nomeia a constraint que recusou, em vez de mostrar o nome cru", () => {
    const casos: [string, string][] = [
      ["tags_org_name_unique", "Já existe uma tag com esse nome."],
      ["visa_types_org_name_unique", "Já existe um tipo de visto com esse nome."],
      ["stage_statuses_org_code_unique", "Já existe um status com esse nome."],
      // Estes dois faltavam nas TRÊS cópias antigas.
      ["pipeline_stages_one_won", "O funil já tem uma etapa de ganho."],
      ["pipeline_stages_one_lost", "O funil já tem uma etapa de perda."],
    ];

    for (const [constraint, esperado] of casos) {
      expect(
        traduzirErro({
          code: "23505",
          message: `duplicate key value violates unique constraint "${constraint}"`,
        }),
      ).toBe(esperado);
    }
  });

  it("não vaza o valor em conflito quando a constraint é desconhecida", () => {
    // Um 23505 do Postgres traz o valor duplicado: aqui, o email de outro
    // contato. Ele não pode chegar à tela.
    const texto = traduzirErro({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "algo_novo_unique"\nDETAIL: Key (email)=(renata@exemplo.com) already exists.',
    });

    expect(texto).toBe("Já existe um registro com esses dados.");
    expect(texto).not.toContain("renata@exemplo.com");
    expect(texto).not.toContain("algo_novo_unique");
  });

  it("traduz permissão negada e sessão expirada", () => {
    expect(traduzirErro({ code: "42501" })).toBe(
      "Você não tem permissão para isto.",
    );
    expect(traduzirErro({ code: "PGRST301" })).toBe(
      "Sua sessão expirou. Entre de novo.",
    );
  });

  it("avisa quando aplicação e banco estão fora de passo — o cenário da 0011", () => {
    const esperado = "O sistema está fora de sincronia com o banco. Avise o suporte.";
    expect(traduzirErro({ code: "42703" })).toBe(esperado);
    expect(traduzirErro({ code: "PGRST204" })).toBe(esperado);
  });

  it("explica dependência em vez de mostrar violação de chave estrangeira", () => {
    expect(traduzirErro({ code: "23503" })).toBe(
      "Existe registro dependendo deste. Remova o que depende primeiro.",
    );
  });

  it("para código desconhecido, dá frase curta e o código — nunca o texto cru", () => {
    const texto = traduzirErro({
      code: "XX000",
      message: "internal error: connection to 10.0.0.14:5432 refused",
    });

    expect(texto).toContain("XX000");
    expect(texto).not.toContain("10.0.0.14");
    expect(texto).not.toContain("internal error");
  });

  it("aguenta falha sem código e falha nenhuma", () => {
    expect(traduzirErro({ message: "algo" })).toBe(
      "Não foi possível concluir. Tente de novo.",
    );
    expect(traduzirErro(null)).toBe("Não foi possível concluir. Tente de novo.");
    expect(traduzirErro(undefined)).toBe("Não foi possível concluir. Tente de novo.");
  });
});
