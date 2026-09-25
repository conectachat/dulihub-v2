import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { esquecerUsuarioLocal } from "@/lib/local/usuario";

/**
 * O motor da sincronia liga uma vez, e no celular também.
 *
 * Ele vivia dentro do indicador da barra lateral, que é `md:flex` e ainda
 * some quando a barra é recolhida: no celular **nada sincronizava**, que é
 * exatamente o aparelho que mais fica sem internet.
 */

const USUARIO = "11111111-1111-4111-8111-111111111111";

let sessao: { user: { id: string } } | null = { user: { id: USUARIO } };

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: sessao } }) },
  }),
}));

const ligarSincronia = vi.fn(() => () => {});
const limparOutrosUsuarios = vi.fn(async () => {});

vi.mock("@/lib/local/sincronizador", () => ({ ligarSincronia }));
vi.mock("@/lib/local/limpeza", () => ({ limparOutrosUsuarios }));

const { SincroniaLigada } = await import("./sincronia-ligada");

beforeEach(() => {
  esquecerUsuarioLocal();
  ligarSincronia.mockClear();
  limparOutrosUsuarios.mockClear();
  sessao = { user: { id: USUARIO } };
});

describe("SincroniaLigada", () => {
  it("liga a sincronia do dono do aparelho e limpa o que é de outra conta", async () => {
    render(<SincroniaLigada />);

    await waitFor(() => expect(ligarSincronia).toHaveBeenCalledWith(USUARIO));
    expect(limparOutrosUsuarios).toHaveBeenCalledWith(USUARIO);
    expect(ligarSincronia).toHaveBeenCalledTimes(1);
  });

  it("sem sessão no aparelho não liga nada — e não apaga nada", async () => {
    sessao = null;
    render(<SincroniaLigada />);

    await waitFor(() => expect(limparOutrosUsuarios).not.toHaveBeenCalled());
    expect(ligarSincronia).not.toHaveBeenCalled();
  });
});
