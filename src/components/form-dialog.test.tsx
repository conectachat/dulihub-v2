import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { falhou, gravou, type ActionState } from "@/lib/action-state";

import { FormDialog } from "./form-dialog";

/**
 * Recusa não fecha o diálogo, nem apaga o que foi digitado (G4 da revisão de
 * novembro).
 *
 * A recusa carregava a mesma marca (`token`) do sucesso, e o diálogo fechava
 * com qualquer marca: a pessoa clicava Salvar, o diálogo sumia, nada tinha
 * sido gravado e nenhum aviso ficava. E mesmo aberto, o React limpa sozinho
 * um `<form action>` depois que a ação termina — com ou sem erro.
 */

function montar(acao: (anterior: ActionState, dados: FormData) => Promise<ActionState>) {
  render(
    <FormDialog acao={acao} gatilho={<button type="button">Novo contato</button>} titulo="Novo contato">
      <input aria-label="Nome" name="nome" />
    </FormDialog>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Novo contato" }));
}

describe("FormDialog", () => {
  it("na recusa, fica aberto, mostra o motivo e guarda o que foi digitado", async () => {
    const acao = vi.fn(async () => falhou("E-mail inválido."));
    montar(acao);

    const nome = await screen.findByLabelText("Nome");
    fireEvent.change(nome, { target: { value: "Gisele" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("E-mail inválido.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toHaveValue("Gisele");
  });

  it("depois de uma recusa, gravar fecha", async () => {
    const acao = vi
      .fn<(a: ActionState, d: FormData) => Promise<ActionState>>()
      .mockResolvedValueOnce(falhou("E-mail inválido."))
      .mockResolvedValueOnce(gravou());
    montar(acao);

    fireEvent.click(await screen.findByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("E-mail inválido.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("manda o que foi digitado para a ação", async () => {
    const acao = vi.fn<(a: ActionState, d: FormData) => Promise<ActionState>>(async () => gravou());
    montar(acao);

    fireEvent.change(await screen.findByLabelText("Nome"), { target: { value: "Gisele" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await vi.waitFor(() => expect(acao).toHaveBeenCalledTimes(1));
    expect(acao.mock.calls[0][1].get("nome")).toBe("Gisele");
  });
});
