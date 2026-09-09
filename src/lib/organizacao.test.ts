import { describe, expect, it } from "vitest";

import { escolherOrganizacao } from "./organizacao";

/**
 * Sete cópias do mesmo lookup faziam `.limit(1)` **sem** `order by` e sem
 * filtrar por usuário. Enquanto existe uma organização só, isso passa. Com a
 * primeira parceira no banco vira escolha não-determinística de tenant: o
 * Postgres devolve a linha que quiser, e uma ação do Renato pode gravar
 * carimbada com a organização do parceiro.
 *
 * A regra precisa ser explícita e ter motivo. Ela é: a raiz manda; sem raiz,
 * a associação mais antiga.
 */

const assoc = (
  organization_id: string,
  type: "root" | "partner",
  created_at: string,
) => ({
  organization_id,
  role: "owner" as const,
  created_at,
  organizations: { type },
});

describe("escolherOrganizacao", () => {
  it("devolve nulo quando a conta não está em organização nenhuma", () => {
    expect(escolherOrganizacao([])).toBeNull();
  });

  it("prefere a raiz, mesmo quando ela é a mais recente", () => {
    // Quem trabalha na Duli e também foi convidado por um parceiro tem de
    // cair na Duli. O contrário grava a operação da casa dentro do parceiro.
    const escolhida = escolherOrganizacao([
      assoc("parceira", "partner", "2026-01-01T00:00:00Z"),
      assoc("duli", "root", "2026-09-01T00:00:00Z"),
    ]);

    expect(escolhida!.organization_id).toBe("duli");
  });

  it("sem raiz, fica com a associação mais antiga", () => {
    const escolhida = escolherOrganizacao([
      assoc("b", "partner", "2026-05-01T00:00:00Z"),
      assoc("a", "partner", "2026-02-01T00:00:00Z"),
    ]);

    expect(escolhida!.organization_id).toBe("a");
  });

  it("não depende da ordem em que o banco devolveu", () => {
    const lista = [
      assoc("b", "partner", "2026-05-01T00:00:00Z"),
      assoc("a", "partner", "2026-02-01T00:00:00Z"),
      assoc("c", "partner", "2026-07-01T00:00:00Z"),
    ];

    const direta = escolherOrganizacao(lista)!.organization_id;
    const invertida = escolherOrganizacao([...lista].reverse())!.organization_id;

    expect(direta).toBe(invertida);
  });

  it("não estraga a lista que recebeu", () => {
    // A mesma lista alimenta o seletor de organização na tela. Ordenar no
    // lugar mudaria o que a pessoa vê, de um jeito difícil de rastrear.
    const lista = [
      assoc("b", "partner", "2026-05-01T00:00:00Z"),
      assoc("a", "partner", "2026-02-01T00:00:00Z"),
    ];

    escolherOrganizacao(lista);

    expect(lista.map((l) => l.organization_id)).toEqual(["b", "a"]);
  });

  it("aguenta associação cuja organização não veio na consulta", () => {
    // Junção que falha, coluna renomeada, policy que esconde a organização:
    // nada disso pode virar exceção no meio de uma Server Action.
    const escolhida = escolherOrganizacao([
      { ...assoc("a", "partner", "2026-02-01T00:00:00Z"), organizations: null },
    ]);

    expect(escolhida!.organization_id).toBe("a");
  });
});
