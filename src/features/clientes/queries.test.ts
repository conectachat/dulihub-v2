// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";

import { listarClientes } from "./queries";

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
