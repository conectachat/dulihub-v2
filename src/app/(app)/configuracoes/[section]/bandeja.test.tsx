import "fake-indexeddb/auto";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BancoDaFila } from "@/lib/local/banco-da-fila";
import type { ItemDaFila } from "@/lib/local/fila";

/**
 * A bandeja: o que este aparelho gravou e o servidor ainda não tem.
 *
 * Ela existe por uma escolha do Renato (21/set): **guardar e perguntar**.
 * Recusa não desfaz nada sozinha — o que ele fez continua visível, com o
 * motivo, e quem decide é ele. Descartar é explícito, e é a única forma de o
 * trabalho dele desaparecer da tela.
 */

const USUARIO = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: USUARIO } } } }) },
  }),
}));

const sincronizarAgora = vi.fn();
vi.mock("@/lib/local/sincronizador", async (original) => ({
  ...(await original<typeof import("@/lib/local/sincronizador")>()),
  sincronizarAgora,
}));

const { Bandeja } = await import("./bandeja");

let fila: BancoDaFila;

function item(extra: Partial<ItemDaFila>): ItemDaFila {
  return {
    id: "i1",
    alvo: "t1",
    depende: [],
    passos: [{ tipo: "update", tabela: "tags", id: "t1", patch: { name: "x" } }],
    rotulo: "Alterar a tag EB-1A",
    criada_em: "2026-09-21T10:00:00Z",
    estado: "pendente",
    enviada_em: null,
    motivo: null,
    ...extra,
  };
}

beforeEach(async () => {
  sincronizarAgora.mockClear();
  fila = new BancoDaFila(USUARIO);
  await fila.open();
});

afterEach(async () => {
  fila.close();
  await BancoDaFila.delete(`dulihub-fila-${USUARIO}`);
});

describe("bandeja de sincronização", () => {
  it("fila vazia diz que está tudo no servidor", async () => {
    render(<Bandeja userId={USUARIO} />);

    expect(await screen.findByText(/Tudo salvo no servidor/i)).toBeTruthy();
  });

  it("mostra o que está esperando, com o que é", async () => {
    await fila.fila.put(item({}));
    render(<Bandeja userId={USUARIO} />);

    expect(await screen.findByText("Alterar a tag EB-1A")).toBeTruthy();
  });

  it("recusada aparece com o motivo, não só com um aviso", async () => {
    await fila.fila.put(
      item({ estado: "conflito", motivo: "Você não tem permissão para isto." }),
    );
    render(<Bandeja userId={USUARIO} />);

    expect(await screen.findByText(/não tem permissão/i)).toBeTruthy();
  });

  it("tentar de novo devolve o item à fila e pede sincronia", async () => {
    await fila.fila.put(item({ estado: "conflito", motivo: "Sem permissão." }));
    render(<Bandeja userId={USUARIO} />);

    fireEvent.click(await screen.findByRole("button", { name: /tentar de novo/i }));

    await waitFor(async () => {
      expect((await fila.fila.get("i1"))?.estado).toBe("pendente");
    });
    expect((await fila.fila.get("i1"))?.motivo).toBeNull();
    expect(sincronizarAgora).toHaveBeenCalledWith(USUARIO);
  });

  it("descartar tira o item, e só depois de confirmar", async () => {
    await fila.fila.put(item({ estado: "conflito", motivo: "Sem permissão." }));
    render(<Bandeja userId={USUARIO} />);

    fireEvent.click(await screen.findByRole("button", { name: /descartar/i }));
    // Ainda não: descartar é perder o que a pessoa escreveu.
    expect(await fila.fila.get("i1")).toBeTruthy();

    fireEvent.click(await screen.findByRole("button", { name: /descartar a alteração/i }));

    await waitFor(async () => expect(await fila.fila.get("i1")).toBeUndefined());
  });
});
