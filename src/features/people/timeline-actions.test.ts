// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { contextoAtual } from "@/lib/organizacao";

import { deleteEntry } from "./timeline-actions";

/**
 * Apagar uma entrada do histórico: só o autor, e nunca registro do sistema.
 * A tela esconde o botão; o servidor recusa também — senão uma requisição
 * montada à mão apagaria "Oportunidade ganha — virou cliente" (D10).
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/organizacao", () => ({ contextoAtual: vi.fn() }));

function bancoFalso() {
  const filtros: unknown[][] = [];
  const consulta = {
    delete: () => consulta,
    eq: (...a: unknown[]) => (filtros.push(["eq", ...a]), consulta),
    not: (...a: unknown[]) => (filtros.push(["not", ...a]), consulta),
    neq: (...a: unknown[]) => (filtros.push(["neq", ...a]), consulta),
    select: async () => ({ data: [], error: null }),
  };
  return { supabase: { from: vi.fn(() => consulta) }, filtros };
}

let banco: ReturnType<typeof bancoFalso>;

beforeEach(() => {
  vi.clearAllMocks();
  banco = bancoFalso();
  vi.mocked(contextoAtual).mockResolvedValue({
    supabase: banco.supabase,
    userId: "u1",
    error: null,
  } as never);
});

describe("deleteEntry", () => {
  it("atividade: o filtro tira todo registro do sistema, não só o movimento de funil", async () => {
    const fd = new FormData();
    fd.set("id", "a1");
    fd.set("kind", "activity");
    fd.set("person_id", "p1");

    await deleteEntry(fd);

    expect(banco.filtros).toContainEqual([
      "not",
      "type",
      "in",
      "(stage_change,registration_submitted,virou_cliente)",
    ]);
  });
});
