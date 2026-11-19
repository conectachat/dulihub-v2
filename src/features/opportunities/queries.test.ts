// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";

import { listarEncerradas } from "./queries";

/**
 * A leitura de CRM › Encerradas (CRM-16). O banco é falso aqui: o que se
 * prova é o pedido (busca, situação, página) e a montagem (total, totais por
 * moeda lidos por esquema). A busca de verdade tem a sua prova em
 * `tests/rls/buscar-encerradas.test.ts`.
 */

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const linha = (id: string, totais: unknown, total = 72) => ({
  id,
  title: `Negócio ${id}`,
  status: "won",
  closed_at: "2026-11-01T12:00:00Z",
  person_id: `p-${id}`,
  full_name: `Contato ${id}`,
  totais,
  total,
});

let rpc: ReturnType<typeof vi.fn>;

function usar(resposta: { data: unknown; error: { message: string } | null }) {
  rpc = vi.fn(async () => resposta);
  vi.mocked(createClient).mockResolvedValue({ rpc } as never);
}

beforeEach(() => vi.clearAllMocks());

describe("listarEncerradas", () => {
  it("pede a página, a busca e a situação, e monta o total e os totais por moeda", async () => {
    usar({
      data: [linha("n1", [{ currency: "BRL", amount: 1000 }, { currency: "USD", amount: 14000 }])],
      error: null,
    });

    const r = await listarEncerradas({ busca: " Maria ", situacao: "won", pagina: 2 });

    expect(rpc).toHaveBeenCalledWith("buscar_encerradas", {
      p_busca: "Maria",
      p_situacao: "won",
      p_limite: 50,
      p_deslocamento: 50,
    });
    expect(r.error).toBeNull();
    expect(r.total).toBe(72);
    expect(r.negocios[0]).toMatchObject({
      id: "n1",
      status: "won",
      full_name: "Contato n1",
      totais: { BRL: 1000, USD: 14000 },
    });
  });

  it("sem situação, não filtra", async () => {
    usar({ data: [], error: null });
    const r = await listarEncerradas({ pagina: 1 });
    expect(rpc).toHaveBeenCalledWith("buscar_encerradas", {
      p_busca: "",
      p_limite: 50,
      p_deslocamento: 0,
    });
    expect(r).toEqual({ negocios: [], total: 0, error: null });
  });

  it("totais num formato inesperado viram erro, não número inventado", async () => {
    usar({ data: [linha("n1", [{ moeda: "BRL", valor: "mil" }])], error: null });
    const r = await listarEncerradas({ pagina: 1 });
    expect(r.error).not.toBeNull();
    expect(r.negocios).toEqual([]);
  });

  it("erro do banco volta como erro", async () => {
    usar({ data: null, error: { message: "falhou" } });
    const r = await listarEncerradas({ pagina: 1 });
    expect(r.error).toBe("falhou");
  });
});
