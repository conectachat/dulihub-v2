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

/**
 * O aviso entre o envio e a gravação (CON-4): a ação devolve "parecidos" sem
 * gravar, o diálogo mostra o aviso e a confirmação reenvia o mesmo
 * formulário com um campo a mais. A confirmação nunca fica guardada no
 * formulário — só existe no clique.
 */
type EstadoComAviso = ActionState & { aviso?: boolean };

const PEDE_CONFIRMACAO: EstadoComAviso = { error: null, token: "aviso-1", aviso: true };

function montarComAviso(acao: (a: EstadoComAviso, d: FormData) => Promise<EstadoComAviso>) {
  render(
    <FormDialog
      acao={acao}
      gatilho={<button type="button">Novo contato</button>}
      titulo="Novo contato"
      aviso={(estado, { reenviarCom }) =>
        estado.aviso ? (
          <button type="button" onClick={() => reenviarCom({ confirmar: "1" })}>
            Confirmar
          </button>
        ) : null
      }
    >
      <input aria-label="Nome" name="nome" />
    </FormDialog>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Novo contato" }));
}

describe("FormDialog com aviso", () => {
  it("reenviarCom manda o FormData do formulário mais o campo extra", async () => {
    const acao = vi
      .fn<(a: EstadoComAviso, d: FormData) => Promise<EstadoComAviso>>()
      .mockResolvedValueOnce(PEDE_CONFIRMACAO)
      .mockResolvedValueOnce(gravou());
    montarComAviso(acao);

    fireEvent.change(await screen.findByLabelText("Nome"), { target: { value: "Gisele" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));

    await vi.waitFor(() => expect(acao).toHaveBeenCalledTimes(2));
    expect(acao.mock.calls[0][1].get("confirmar")).toBeNull();
    const segunda = acao.mock.calls[1][1];
    expect(segunda.get("nome")).toBe("Gisele");
    expect(segunda.get("confirmar")).toBe("1");
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("estado com parecidos e sem ok não fecha o diálogo", async () => {
    const acao = vi.fn(async () => PEDE_CONFIRMACAO);
    montarComAviso(acao);

    fireEvent.click(await screen.findByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("button", { name: "Confirmar" })).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("reabrir não mostra o aviso da abertura anterior", async () => {
    const acao = vi.fn(async () => PEDE_CONFIRMACAO);
    montarComAviso(acao);

    fireEvent.click(await screen.findByRole("button", { name: "Salvar" }));
    await screen.findByRole("button", { name: "Confirmar" });

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Novo contato" }));
    await screen.findByLabelText("Nome");
    expect(screen.queryByRole("button", { name: "Confirmar" })).toBeNull();
  });
});
