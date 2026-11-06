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
const sincronizar = vi.fn(async () => ({ error: null, em: "2026-11-06T12:00:00Z", tabelas: {} }));
vi.mock("./espelho", () => ({ sincronizar: () => sincronizar() }));

let sessao: { user: { id: string } } | null = { user: { id: "u1" } };
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: sessao }, error: null }) } }),
}));
vi.mock("./transporte-da-fila", () => ({ transporteDaFila: () => ({}) }));
vi.mock("./transporte-supabase", () => ({ transporteSupabase: () => ({}) }));
const definirEstado = vi.fn();
vi.mock("./estado", () => ({
  aplicarResultado: vi.fn(),
  definirEstado: (m: unknown) => definirEstado(m),
  estadoAtual: () => ({}),
}));

const { sincronizarAgora, fecharBancos } = await import("./sincronizador");

afterEach(() => {
  fecharBancos();
  drenar.mockClear();
  sincronizar.mockClear();
  definirEstado.mockClear();
  sessao = { user: { id: "u1" } };
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

  it("sem sessão válida, nem sobe nem baixa — e diz para entrar de novo (G8)", async () => {
    // O aparelho sabe de quem é mesmo sem sessão (para abrir offline). Mas
    // subir sem sessão mandaria com a chave anônima, e a RLS recusaria tudo
    // como conflito; baixar sem sessão traria a cópia vazia.
    sessao = null;

    await sincronizarAgora("u1");

    expect(drenar).not.toHaveBeenCalled();
    expect(sincronizar).not.toHaveBeenCalled();
    expect(definirEstado).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/entre de novo/i) }),
    );
  });

  it("sessão de outra pessoa também não serve", async () => {
    sessao = { user: { id: "outra" } };
    await sincronizarAgora("u1");
    expect(drenar).not.toHaveBeenCalled();
    expect(sincronizar).not.toHaveBeenCalled();
  });
});
