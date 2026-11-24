// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";

import { listarClientes, listarParceirosParaNovoCliente } from "./queries";

/**
 * A leitura da lista de Clientes. O banco é falso aqui: o que se prova é o
 * pedido (página, busca) e a montagem (total, nome do dono). A busca de
 * verdade tem a sua prova em `tests/rls/buscar-clientes.test.ts`.
 */

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

type LinhaDaBusca = {
  id: string;
  full_name: string;
  email: string | null;
  phone_country_code: string | null;
  phone: string | null;
  owner_id: string | null;
  client_since: string | null;
  partner_organization_id?: string | null;
  parceiro_nome?: string | null;
  parceiro_email?: string | null;
  parceiro_ddi?: string | null;
  parceiro_telefone?: string | null;
  total: number;
};

const linha = (id: string, owner_id: string | null, total = 72): LinhaDaBusca => ({
  id,
  full_name: `Cliente ${id}`,
  email: `${id}@example.com`,
  phone_country_code: "+55",
  phone: "31999990000",
  owner_id,
  client_since: owner_id ? "2026-03-01" : null,
  total,
});

function bancoFalso(
  linhas: LinhaDaBusca[] | { erro: string },
  perfis: { id: string; full_name: string | null; email: string }[] = [],
) {
  const rpc = vi.fn(async () =>
    "erro" in linhas
      ? { data: null, error: { message: linhas.erro } }
      : { data: linhas, error: null },
  );
  const inIds = vi.fn(async () => ({ data: perfis, error: null }));
  const select = vi.fn(() => ({ in: inIds }));
  const from = vi.fn(() => ({ select }));
  vi.mocked(createClient).mockResolvedValue({ rpc, from } as never);
  return { rpc, from, select, inIds };
}

beforeEach(() => vi.clearAllMocks());

describe("listarClientes", () => {
  it("pede a página certa, com a busca aparada", async () => {
    const banco = bancoFalso([]);

    await listarClientes({ busca: "  carla ", pagina: 3 });

    expect(banco.rpc).toHaveBeenCalledWith("buscar_clientes", {
      p_busca: "carla",
      p_limite: 50,
      p_deslocamento: 100,
    });
  });

  it("o total vem do banco, não do tamanho da página", async () => {
    bancoFalso([linha("a", null), linha("b", null)]);

    const r = await listarClientes({ pagina: 1 });

    expect(r.total).toBe(72);
    expect(r.clientes.map((c) => c.id)).toEqual(["a", "b"]);
    expect(r.error).toBeNull();
  });

  it("o nome do dono vem de profiles, numa segunda consulta só com os ids que existem", async () => {
    const banco = bancoFalso(
      [linha("a", "u1"), linha("b", "u2"), linha("c", "u1"), linha("d", null)],
      [
        { id: "u1", full_name: "Renato", email: "renato@example.com" },
        { id: "u2", full_name: null, email: "ana@example.com" },
      ],
    );

    const r = await listarClientes({ pagina: 1 });

    expect(banco.from).toHaveBeenCalledWith("profiles");
    expect(banco.select).toHaveBeenCalledWith("id, full_name, email");
    expect(banco.inIds).toHaveBeenCalledWith("id", ["u1", "u2"]);
    expect(r.clientes.map((c) => c.dono)).toEqual(["Renato", "ana@example.com", "Renato", null]);
  });

  it("dono que não se enxerga fica sem nome, e a lista continua", async () => {
    bancoFalso([linha("a", "u9")], []);

    const r = await listarClientes({ pagina: 1 });

    expect(r.clientes[0].dono).toBeNull();
    expect(r.error).toBeNull();
  });

  it("sem dono nenhum, nem consulta profiles", async () => {
    const banco = bancoFalso([linha("a", null)]);

    await listarClientes({ pagina: 1 });

    expect(banco.from).not.toHaveBeenCalled();
  });

  it("sem cliente, total zero", async () => {
    bancoFalso([]);

    expect(await listarClientes({ pagina: 1 })).toEqual({ clientes: [], total: 0, error: null });
  });

  it("erro do banco vira mensagem, e não lista vazia", async () => {
    bancoFalso({ erro: "falhou" });

    expect(await listarClientes({ pagina: 1 })).toEqual({ clientes: [], total: 0, error: "falhou" });
  });
});

describe("listarClientes › cliente de parceiro (PAR-6)", () => {
  it("monta o parceiro com o nome e o contato dele; o cliente direto fica sem", async () => {
    bancoFalso([
      {
        ...linha("c1", null, 2),
        email: null,
        phone_country_code: null,
        phone: null,
        partner_organization_id: "thais",
        parceiro_nome: "Thais Fabrini",
        parceiro_email: "thais@exemplo.com",
        parceiro_ddi: "+1",
        parceiro_telefone: "3055550100",
      },
      { ...linha("c2", null, 2), partner_organization_id: null },
    ]);

    const { clientes } = await listarClientes({ pagina: 1 });

    expect(clientes[0].partner_organization_id).toBe("thais");
    expect(clientes[0].parceiro).toEqual({
      name: "Thais Fabrini",
      email: "thais@exemplo.com",
      phone_country_code: "+1",
      phone: "3055550100",
    });
    expect(clientes[1].parceiro).toBeNull();
  });
});

describe("listarParceirosParaNovoCliente", () => {
  // Os parceiros que o Novo cliente oferece (PAR-5): os da organização atual,
  // pela regra de `parceirosVisiveis` — nunca ela mesma, e teste só com teste.
  function organizacoes(resposta: { data: unknown; error: unknown }) {
    const select = vi.fn(async () => resposta);
    const from = vi.fn(() => ({ select }));
    vi.mocked(createClient).mockResolvedValue({ from } as never);
    return { from, select };
  }

  it("devolve os parceiros reais, por nome, para quem está na Duli", async () => {
    const banco = organizacoes({
      data: [
        { id: "duli", name: "Duli", type: "root", is_test: false },
        { id: "thais", name: "Thais Fabrini", type: "partner", is_test: false },
        { id: "teste", name: "Parceiro de Teste", type: "partner", is_test: true },
        { id: "ana", name: "Ana Parceira", type: "partner", is_test: false },
      ],
      error: null,
    });

    expect(await listarParceirosParaNovoCliente("duli")).toEqual({
      parceiros: [
        { id: "ana", nome: "Ana Parceira" },
        { id: "thais", nome: "Thais Fabrini" },
      ],
      error: null,
    });
    expect(banco.from).toHaveBeenCalledWith("organizations");
  });

  it("erro de leitura volta como erro, não como lista vazia", async () => {
    organizacoes({ data: null, error: { message: "caiu" } });
    expect(await listarParceirosParaNovoCliente("duli")).toEqual({ parceiros: [], error: "caiu" });
  });
});
