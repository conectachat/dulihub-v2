import { describe, expect, it, vi } from "vitest";

import { daGestaoDe, ehDaGestao, escolherOrganizacao } from "./organizacao";

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

describe("ehDaGestao", () => {
  it("owner e admin são da gestão; staff, nulo e indefinido não", () => {
    expect(ehDaGestao("owner")).toBe(true);
    expect(ehDaGestao("admin")).toBe(true);
    expect(ehDaGestao("staff")).toBe(false);
    expect(ehDaGestao(null)).toBe(false);
    expect(ehDaGestao(undefined)).toBe(false);
  });
});

describe("daGestaoDe", () => {
  function bancoFalso(resposta: { data: { role: string } | null; error: { message: string } | null }) {
    const maybeSingle = vi.fn(async () => resposta);
    const eqUsuario = vi.fn(() => ({ maybeSingle }));
    const eqOrg = vi.fn(() => ({ eq: eqUsuario }));
    const select = vi.fn(() => ({ eq: eqOrg }));
    const from = vi.fn(() => ({ select }));
    return { supabase: { from } as never, from, eqOrg, eqUsuario };
  }

  it("lê o papel de quem chama na organização do registro", async () => {
    const banco = bancoFalso({ data: { role: "admin" }, error: null });
    expect(await daGestaoDe(banco.supabase, "org-1", "u-1")).toEqual({ daGestao: true, error: null });
    expect(banco.from).toHaveBeenCalledWith("organization_members");
    expect(banco.eqOrg).toHaveBeenCalledWith("organization_id", "org-1");
    expect(banco.eqUsuario).toHaveBeenCalledWith("user_id", "u-1");
  });

  it("staff e nenhuma linha não são da gestão", async () => {
    const comStaff = bancoFalso({ data: { role: "staff" }, error: null });
    expect(await daGestaoDe(comStaff.supabase, "o", "u")).toEqual({ daGestao: false, error: null });
    const semLinha = bancoFalso({ data: null, error: null });
    expect(await daGestaoDe(semLinha.supabase, "o", "u")).toEqual({ daGestao: false, error: null });
  });

  it("erro de leitura vem como erro, não como \"não é da gestão\"", async () => {
    const banco = bancoFalso({ data: null, error: { message: "caiu" } });
    expect(await daGestaoDe(banco.supabase, "o", "u")).toEqual({ daGestao: false, error: "caiu" });
  });

  it("sem usuário, não consulta", async () => {
    const banco = bancoFalso({ data: { role: "owner" }, error: null });
    expect(await daGestaoDe(banco.supabase, "o", null)).toEqual({ daGestao: false, error: null });
    expect(banco.from).not.toHaveBeenCalled();
  });
});
