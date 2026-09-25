import "fake-indexeddb/auto";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BancoLocal } from "@/lib/local/banco";
import { BancoDaFila } from "@/lib/local/banco-da-fila";
import { esquecerUsuarioLocal } from "@/lib/local/usuario";

/**
 * Sair com gravação pendente.
 *
 * Sair apaga o que o aparelho guarda. Com a fila cheia, isso é perder
 * trabalho que só existe ali — o servidor nunca recebeu. Escolha do Renato:
 * avisar e segurar, com a saída ainda possível e dita por extenso.
 */

const USUARIO = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: USUARIO } } } }) },
  }),
}));

const signOut = vi.fn();
vi.mock("@/features/auth/actions", () => ({ signOut }));

const { Sair } = await import("./sair");

let fila: BancoDaFila;

beforeEach(async () => {
  esquecerUsuarioLocal();
  signOut.mockClear();
  fila = new BancoDaFila(USUARIO);
  await fila.open();
});

afterEach(async () => {
  fila.close();
  await BancoDaFila.delete(`dulihub-fila-${USUARIO}`);
});

async function enfileirarUma() {
  await fila.fila.put({
    id: "i1",
    alvo: "t1",
    depende: [],
    passos: [{ tipo: "delete", tabela: "tags", id: "t1" }],
    rotulo: "Excluir a tag EB-1A",
    criada_em: "2026-09-21T10:00:00Z",
    estado: "pendente",
    enviada_em: null,
    motivo: null,
  });
}

describe("sair", () => {
  it("com a fila vazia, sai direto", async () => {
    render(<Sair collapsed={false} />);

    fireEvent.click(await screen.findByRole("button", { name: "Sair" }));

    expect(screen.queryByText(/ainda não subiu/i)).toBeNull();
  });

  it("com gravação pendente, avisa antes e diz quantas", async () => {
    await enfileirarUma();
    render(<Sair collapsed={false} />);

    // O botão só passa a segurar quando a leitura da fila responde; até lá
    // ele é o de sempre, dentro do formulário que sai na hora.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sair" })).toHaveAttribute(
        "type",
        "button",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));

    expect(await screen.findByText("1 alteração ainda não subiu")).toBeTruthy();
    expect(screen.getByRole("button", { name: /continuar conectado/i })).toBeTruthy();
  });

  it("sair apaga o espelho e a fila deste aparelho", async () => {
    // O comentário deste componente prometia isso desde o primeiro dia, e
    // nada no código fazia. Num computador compartilhado, a carteira de quem
    // saiu continuava no disco.
    const espelho = new BancoLocal(USUARIO);
    await espelho.open();
    await espelho.tabela("tags").put({ id: "t1", organization_id: "o1", name: "EB-1A" });
    espelho.close();

    render(<Sair collapsed={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sair" }));

    await waitFor(async () => {
      const nomes = (await indexedDB.databases()).map((d) => d.name);
      expect(nomes).not.toContain(`dulihub-${USUARIO}`);
      expect(nomes).not.toContain(`dulihub-fila-${USUARIO}`);
    });
    expect(signOut).toHaveBeenCalled();
  });
});
