import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPerson } from "@/features/people/actions";
import { gravou } from "@/lib/action-state";
import { CAMPO_CONFIRMAR_PARECIDO, type EstadoComConfirmacao } from "@/lib/parecidos";

import { PersonDialog } from "./person-dialog";

/**
 * Novo contato com e-mail ou telefone que já existem (CON-8): o diálogo
 * mostra o aviso e não fecha; "Criar mesmo assim" reenvia o mesmo
 * formulário, agora com a confirmação.
 */

vi.mock("@/features/people/actions", () => ({
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
  restorePerson: vi.fn(),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const COM_PARECIDO: EstadoComConfirmacao = {
  error: null,
  token: "t1",
  parecidos: [
    {
      id: "p1",
      nome: "Carlos Souza",
      estagio: "client",
      naLixeira: false,
      bateEmail: false,
      bateTelefone: true,
    },
  ],
};

async function preencherEEnviar() {
  fireEvent.click(screen.getByRole("button", { name: "Novo Contato" }));
  fireEvent.change(await screen.findByLabelText("Nome *"), { target: { value: "Carla Souza" } });
  fireEvent.change(screen.getByLabelText("Telefone *"), { target: { value: "31 99999-0000" } });
  fireEvent.change(screen.getByLabelText("E-mail *"), { target: { value: "carla@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PersonDialog", () => {
  it("parecido mostra o aviso e não fecha", async () => {
    vi.mocked(createPerson).mockResolvedValue(COM_PARECIDO);
    render(<PersonDialog />);

    await preencherEEnviar();

    expect(await screen.findByText(/Telefone já cadastrado em/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Criar mesmo assim reenvia com confirmar_contato_parecido=1", async () => {
    vi.mocked(createPerson).mockResolvedValueOnce(COM_PARECIDO).mockResolvedValueOnce(gravou());
    render(<PersonDialog />);

    await preencherEEnviar();
    fireEvent.click(await screen.findByRole("button", { name: "Não, é outra pessoa" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar mesmo assim" }));

    await vi.waitFor(() => expect(createPerson).toHaveBeenCalledTimes(2));
    const primeira = vi.mocked(createPerson).mock.calls[0][1];
    const segunda = vi.mocked(createPerson).mock.calls[1][1];
    expect(primeira.get(CAMPO_CONFIRMAR_PARECIDO)).toBeNull();
    expect(segunda.get(CAMPO_CONFIRMAR_PARECIDO)).toBe("1");
    expect(segunda.get("full_name")).toBe("Carla Souza");
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Sim, é a mesma pessoa abre o existente e fecha sem gravar", async () => {
    vi.mocked(createPerson).mockResolvedValue(COM_PARECIDO);
    render(<PersonDialog />);

    await preencherEEnviar();
    fireEvent.click(await screen.findByRole("button", { name: "Sim, é a mesma pessoa" }));

    expect(push).toHaveBeenCalledWith("/contatos/p1");
    expect(createPerson).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
