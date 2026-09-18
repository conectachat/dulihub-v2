import { describe, expect, it } from "vitest";

import {
  processoFromForm,
  proximoPrazo,
  STATUS_DO_PROCESSO,
  tituloSugerido,
} from "./schema";

/**
 * O formulário de novo processo, montado com os mesmos `name` da tela
 * (`novo-processo-dialog.tsx`) — a lição de `people/schema.test.ts`: testar o
 * objeto ideal deixou criar contato quebrado por dois dias.
 */

const PESSOA = "11111111-1111-4111-8111-111111111111";
const VISTO = "22222222-2222-4222-8222-222222222222";
const NEGOCIO = "33333333-3333-4333-8333-333333333333";

function formularioDaTela(sobrescreve: Record<string, string> = {}) {
  const fd = new FormData();
  const campos = {
    person_id: PESSOA,
    visa_type_id: VISTO,
    title: "EB-2 NIW · Renata Carneiro",
    opportunity_id: "",
    ...sobrescreve,
  };
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

describe("processoFromForm", () => {
  it("aceita o formulário como a tela o envia", () => {
    const r = processoFromForm(formularioDaTela());
    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      person_id: PESSOA,
      visa_type_id: VISTO,
      title: "EB-2 NIW · Renata Carneiro",
      opportunity_id: null,
    });
  });

  it("negócio vazio vira nulo, não texto vazio", () => {
    // "" iria ao banco como uuid inválido e a criação falharia com erro de
    // tipo — na cara de quem só não quis ligar o processo a um negócio.
    const r = processoFromForm(formularioDaTela({ opportunity_id: "" }));
    expect(r.data?.opportunity_id).toBeNull();
  });

  it("guarda o negócio quando vem escolhido", () => {
    const r = processoFromForm(formularioDaTela({ opportunity_id: NEGOCIO }));
    expect(r.data?.opportunity_id).toBe(NEGOCIO);
  });

  it("campo de negócio ausente também vira nulo", () => {
    const fd = formularioDaTela();
    fd.delete("opportunity_id");
    expect(processoFromForm(fd).data?.opportunity_id).toBeNull();
  });

  it("exige o tipo de visto, em português", () => {
    const r = processoFromForm(formularioDaTela({ visa_type_id: "" }));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Escolha o tipo de visto");
  });

  it("exige título, e espaço em branco não conta", () => {
    const r = processoFromForm(formularioDaTela({ title: "   " }));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Informe um título");
  });

  it("apara o título", () => {
    const r = processoFromForm(formularioDaTela({ title: "  EB-1A  " }));
    expect(r.data?.title).toBe("EB-1A");
  });
});

describe("tituloSugerido", () => {
  it("junta visto e nome", () => {
    expect(tituloSugerido("EB-2 NIW", "Renata Carneiro")).toBe(
      "EB-2 NIW · Renata Carneiro",
    );
  });

  it("sem visto escolhido, só o nome", () => {
    expect(tituloSugerido(null, "Renata Carneiro")).toBe("Renata Carneiro");
  });
});

describe("proximoPrazo", () => {
  const pasta = (deadline_on: string | null, resolvida = false) => ({
    deadline_on,
    resolved_at: resolvida ? "2026-09-18T12:00:00Z" : null,
  });

  it("é o prazo mais próximo entre as pastas em aberto", () => {
    expect(
      proximoPrazo([pasta("2026-10-20"), pasta("2026-10-03"), pasta(null)]),
    ).toBe("2026-10-03");
  });

  it("pasta resolvida não conta, mesmo com prazo mais cedo", () => {
    // Prazo de pasta resolvida já foi cumprido: mostrá-lo na lista faria um
    // processo em dia parecer atrasado.
    expect(
      proximoPrazo([pasta("2026-09-20", true), pasta("2026-10-03")]),
    ).toBe("2026-10-03");
  });

  it("sem prazo em aberto, nulo", () => {
    expect(proximoPrazo([pasta(null), pasta("2026-09-20", true)])).toBeNull();
    expect(proximoPrazo([])).toBeNull();
  });
});

describe("STATUS_DO_PROCESSO", () => {
  it("tem nome em português para cada status que o banco aceita", () => {
    // A lista tem de bater com o check de `projects.status` na 0020.
    expect(Object.keys(STATUS_DO_PROCESSO).sort()).toEqual([
      "active",
      "approved",
      "closed",
      "denied",
      "filed",
    ]);
  });
});
