import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Pedido de sincronia no meio de outra não se perde (G7 da revisão de
 * novembro).
 *
 * Uma sincronia por vez — duas disputariam a marca d'água. Mas quem pedia
 * enquanto uma rodava era simplesmente ignorado: o segundo clique de
 * reordenar entrava na fila e esperava o próximo gatilho (foco, rede, um
 * minuto), parecendo perdido.
 */

let liberar: () => void = () => {};
const drenar = vi.fn(
  () =>
    new Promise((resolve) => {
      liberar = () => resolve({ subiram: 0, conflitos: 0, parou: null });
    }),
);

vi.mock("./fila", async (original) => ({
  ...(await original<typeof import("./fila")>()),
  drenar: (...args: unknown[]) => drenar(...(args as [])),
}));
vi.mock("./espelho", () => ({
  sincronizar: vi.fn(async () => ({ error: null, em: "2026-11-06T12:00:00Z", tabelas: {} })),
}));
vi.mock("./transporte-da-fila", () => ({ transporteDaFila: () => ({}) }));
vi.mock("./transporte-supabase", () => ({ transporteSupabase: () => ({}) }));
vi.mock("./estado", () => ({
  aplicarResultado: vi.fn(),
  definirEstado: vi.fn(),
  estadoAtual: () => ({}),
}));

const { sincronizarAgora, fecharBancos } = await import("./sincronizador");

afterEach(() => {
  fecharBancos();
  drenar.mockClear();
});

describe("sincronizarAgora", () => {
  it("pedido durante uma rodada gera mais uma rodada ao terminar", async () => {
    const primeira = sincronizarAgora("u1");
    await vi.waitFor(() => expect(drenar).toHaveBeenCalledTimes(1));

    const segunda = sincronizarAgora("u1");
    liberar();
    await vi.waitFor(() => expect(drenar).toHaveBeenCalledTimes(2));
    liberar();

    await Promise.all([primeira, segunda]);
    expect(drenar).toHaveBeenCalledTimes(2);
  });

  it("sem pedido no meio, uma rodada só", async () => {
    const rodada = sincronizarAgora("u1");
    await vi.waitFor(() => expect(drenar).toHaveBeenCalledTimes(1));
    liberar();
    await rodada;
    expect(drenar).toHaveBeenCalledTimes(1);
  });
});
