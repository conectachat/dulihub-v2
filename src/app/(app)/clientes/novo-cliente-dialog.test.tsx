import { createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buscarContatosParaCliente, criarCliente } from "@/features/clientes/novo-cliente-actions";
import { restorePerson } from "@/features/people/actions";
import { gravou } from "@/lib/action-state";
import { CAMPO_CONFIRMAR_PARECIDO, type ContatoParecido } from "@/lib/parecidos";

import { NovoClienteDialog } from "./novo-cliente-dialog";

/**
 * O Novo cliente (CLI-15) na tela: escolher um contato pela busca ou criar
 * um novo; o aviso de que não tem volta; o aviso de parecido.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/features/clientes/novo-cliente-actions", () => ({
  criarCliente: vi.fn(),
  buscarContatosParaCliente: vi.fn(),
}));
vi.mock("@/features/people/actions", () => ({ restorePerson: vi.fn() }));

const ANA = { id: "a", full_name: "Ana Souza", email: "ana@x.co", phone_country_code: "+55", phone: "31 99999-0000" };
const BIA = { id: "b", full_name: "Bia Lima", email: null, phone_country_code: null, phone: null };

const PARECIDO: ContatoParecido = {
  id: "p9",
  nome: "Paula Prado",
  estagio: "contact",
  naLixeira: false,
  bateEmail: true,
  bateTelefone: false,
};

const chamada = (n: number) => vi.mocked(criarCliente).mock.calls[n]![1];

function abrir() {
  render(<NovoClienteDialog />);
  fireEvent.click(screen.getByRole("button", { name: "Novo cliente" }));
}

async function preencherContatoNovo() {
  fireEvent.click(await screen.findByRole("button", { name: "Novo contato" }));
  fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Paula Prado" } });
  fireEvent.change(screen.getByLabelText("Telefone *"), { target: { value: "31 98888-0000" } });
  fireEvent.change(screen.getByLabelText("E-mail *"), { target: { value: "paula@x.co" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buscarContatosParaCliente).mockResolvedValue({ linhas: [ANA, BIA], total: 2, error: null });
});

describe("NovoClienteDialog", () => {
  it("abre com Contato existente e já busca com o termo vazio, mostrando nome, e-mail e telefone", async () => {
    abrir();

    expect(screen.getByRole("group", { name: "Contato do cliente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contato existente" })).toHaveAttribute("aria-pressed", "true");
    expect(buscarContatosParaCliente).toHaveBeenCalledWith("");

    const ana = await screen.findByRole("button", { name: /Escolher Ana Souza/ });
    expect(within(ana).getByText("ana@x.co")).toBeInTheDocument();
    expect(within(ana).getByText(/99999-0000/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Escolher Bia Lima/ })).toBeInTheDocument();
  });

  it("acima do limite, diz quantos e pede para refinar", async () => {
    const vinte = Array.from({ length: 20 }, (_, i) => ({ ...BIA, id: `x${i}`, full_name: `Pessoa ${i}` }));
    vi.mocked(buscarContatosParaCliente).mockResolvedValue({ linhas: vinte, total: 25, error: null });
    abrir();

    expect(await screen.findByText("Mostrando 20 de 25; refine a busca.")).toBeInTheDocument();
  });

  it("busca o que se digita, e a resposta atrasada não vale", async () => {
    let soltarA: (v: Awaited<ReturnType<typeof buscarContatosParaCliente>>) => void = () => {};
    vi.mocked(buscarContatosParaCliente).mockImplementation(async (termo: string) => {
      if (termo === "a") return new Promise((resolver) => (soltarA = resolver));
      if (termo === "ab") return { linhas: [BIA], total: 1, error: null };
      return { linhas: [ANA, BIA], total: 2, error: null };
    });
    abrir();
    const caixa = screen.getByLabelText("Buscar contato");

    fireEvent.change(caixa, { target: { value: "a" } });
    await vi.waitFor(() => expect(buscarContatosParaCliente).toHaveBeenCalledWith("a"));
    fireEvent.change(caixa, { target: { value: "ab" } });
    await vi.waitFor(() => expect(buscarContatosParaCliente).toHaveBeenCalledWith("ab"));
    await screen.findByRole("button", { name: /Escolher Bia Lima/ });

    soltarA({ linhas: [ANA], total: 1, error: null });
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.queryByRole("button", { name: /Escolher Ana Souza/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Escolher Bia Lima/ })).toBeInTheDocument();
  });

  it("Enter na busca não envia o formulário, e a busca não é campo do formulário", () => {
    abrir();
    const caixa = screen.getByLabelText("Buscar contato");

    const enter = createEvent.keyDown(caixa, { key: "Enter" });
    fireEvent(caixa, enter);

    expect(enter.defaultPrevented).toBe(true);
    expect(caixa).not.toHaveAttribute("name");
    expect(criarCliente).not.toHaveBeenCalled();
  });

  it("escolher grava o contato; Trocar volta à busca; Criar manda o escolhido", async () => {
    vi.mocked(criarCliente).mockResolvedValue(gravou());
    abrir();

    fireEvent.click(await screen.findByRole("button", { name: /Escolher Ana Souza/ }));
    expect(screen.queryByLabelText("Buscar contato")).toBeNull();
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Trocar" }));
    fireEvent.click(await screen.findByRole("button", { name: /Escolher Ana Souza/ }));
    fireEvent.click(screen.getByRole("button", { name: "Criar cliente" }));

    await vi.waitFor(() => expect(criarCliente).toHaveBeenCalledTimes(1));
    expect(chamada(0).get("modo_contato")).toBe("existente");
    expect(chamada(0).get("person_id")).toBe("a");
  });

  it("o aviso de que não tem volta aparece nos dois modos; Novo contato mostra os campos", async () => {
    abrir();
    expect(screen.getByText("Não tem volta: cliente não volta a ser lead.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Novo contato" }));
    for (const rotulo of ["Nome *", "DDI *", "Telefone *", "E-mail *"]) {
      expect(screen.getByLabelText(rotulo)).toBeRequired();
    }
    expect(screen.getByText("Não tem volta: cliente não volta a ser lead.")).toBeInTheDocument();
  });

  it("parecido que não é cliente: Sim reenvia no modo existente", async () => {
    vi.mocked(criarCliente)
      .mockResolvedValueOnce({ error: null, token: "t1", parecidos: [PARECIDO] })
      .mockResolvedValueOnce(gravou());
    abrir();
    await preencherContatoNovo();
    fireEvent.click(screen.getByRole("button", { name: "Criar cliente" }));

    fireEvent.click(await screen.findByRole("button", { name: /^Sim, é a mesma pessoa/ }));

    await vi.waitFor(() => expect(criarCliente).toHaveBeenCalledTimes(2));
    expect(chamada(0).get("modo_contato")).toBe("novo");
    expect(chamada(1).get("modo_contato")).toBe("existente");
    expect(chamada(1).get("person_id")).toBe("p9");
    expect(chamada(1).get(CAMPO_CONFIRMAR_PARECIDO)).toBeNull();
  });

  it("parecido que já é cliente: Sim leva ao perfil dele, sem gravar", async () => {
    vi.mocked(criarCliente).mockResolvedValueOnce({
      error: null,
      token: "t1",
      parecidos: [{ ...PARECIDO, id: "p8", estagio: "client" }],
    });
    abrir();
    await preencherContatoNovo();
    fireEvent.click(screen.getByRole("button", { name: "Criar cliente" }));

    fireEvent.click(await screen.findByRole("button", { name: /^Sim, é a mesma pessoa/ }));

    expect(push).toHaveBeenCalledWith("/clientes/p8?aba=projetos&novo-processo=novo");
    expect(criarCliente).toHaveBeenCalledTimes(1);
  });

  it("parecido na lixeira: Restaurar restaura e reenvia com ele", async () => {
    vi.mocked(criarCliente)
      .mockResolvedValueOnce({ error: null, token: "t1", parecidos: [{ ...PARECIDO, naLixeira: true }] })
      .mockResolvedValueOnce(gravou());
    vi.mocked(restorePerson).mockResolvedValue(gravou());
    abrir();
    await preencherContatoNovo();
    fireEvent.click(screen.getByRole("button", { name: "Criar cliente" }));

    fireEvent.click(await screen.findByRole("button", { name: /^Restaurar / }));

    await vi.waitFor(() => expect(criarCliente).toHaveBeenCalledTimes(2));
    expect(vi.mocked(restorePerson).mock.calls[0]![0].get("id")).toBe("p9");
    expect(chamada(1).get("person_id")).toBe("p9");
    expect(chamada(1).get("modo_contato")).toBe("existente");
  });
});
