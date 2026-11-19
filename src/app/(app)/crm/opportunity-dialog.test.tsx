import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createOpportunity } from "@/features/opportunities/actions";
import { restorePerson } from "@/features/people/actions";
import { gravou } from "@/lib/action-state";
import {
  CAMPO_CONFIRMAR_OPORTUNIDADE,
  CAMPO_CONFIRMAR_PARECIDO,
  type EstadoComConfirmacao,
} from "@/lib/parecidos";

import { OpportunityDialog } from "./opportunity-dialog";

/**
 * Nova oportunidade com contato existente ou novo (CRM-11, CRM-12), e os dois
 * avisos: contato parecido (CON-4) e oportunidade anterior do contato.
 */

vi.mock("@/features/opportunities/actions", () => ({ createOpportunity: vi.fn() }));
vi.mock("@/features/people/actions", () => ({ restorePerson: vi.fn() }));

const PEOPLE = [
  { id: "p2", full_name: "Bruna Lima" },
  { id: "p3", full_name: "Caio Reis" },
];
const STAGES = [{ id: "s1", name: "Novo Lead" }];

const PARECIDO = {
  id: "p9",
  nome: "Carlos Souza",
  estagio: "client" as const,
  naLixeira: false,
  bateEmail: false,
  bateTelefone: true,
};

const COM_PARECIDO: EstadoComConfirmacao = { error: null, token: "t1", parecidos: [PARECIDO] };

const COM_OPORTUNIDADE: EstadoComConfirmacao = {
  error: null,
  token: "t2",
  oportunidades: [
    { id: "n1", titulo: "EB-2 NIW", status: "won", criadaEm: "2026-10-01T12:00:00+00:00" },
  ],
};

function abrir() {
  render(<OpportunityDialog people={PEOPLE} stages={STAGES} />);
  fireEvent.click(screen.getByRole("button", { name: "Nova oportunidade" }));
}

async function preencherContatoNovo() {
  fireEvent.click(await screen.findByRole("button", { name: "Novo contato" }));
  fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Carla Souza" } });
  fireEvent.change(screen.getByLabelText("Telefone *"), { target: { value: "31 99999-0000" } });
  fireEvent.change(screen.getByLabelText("E-mail *"), { target: { value: "carla@example.com" } });
  fireEvent.change(screen.getByLabelText("Título *"), { target: { value: "EB-2 NIW" } });
}

const chamada = (n: number) => vi.mocked(createOpportunity).mock.calls[n][1];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OpportunityDialog", () => {
  it("não pede valor: os vistos, com o valor de cada um, entram na tela do lead (D11)", () => {
    abrir();
    expect(screen.queryByLabelText("Valor")).toBeNull();
    expect(screen.queryByLabelText("Moeda")).toBeNull();
  });

  it("Novo contato mostra nome, DDI, telefone e e-mail obrigatórios", async () => {
    abrir();

    const novo = await screen.findByRole("button", { name: "Novo contato" });
    expect(novo).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(novo);
    expect(novo).toHaveAttribute("aria-pressed", "true");

    for (const rotulo of ["Nome *", "DDI *", "Telefone *", "E-mail *"]) {
      expect(screen.getByLabelText(rotulo)).toBeRequired();
    }
    expect(screen.getByLabelText("DDI *")).toHaveValue("+55");
  });

  it("parecido: Sim usa o existente mesmo fora da lista e reenvia", async () => {
    vi.mocked(createOpportunity).mockResolvedValueOnce(COM_PARECIDO).mockResolvedValueOnce(gravou());
    abrir();
    await preencherContatoNovo();
    fireEvent.click(screen.getByRole("button", { name: "Criar oportunidade" }));

    fireEvent.click(await screen.findByRole("button", { name: /^Sim, é a mesma pessoa/ }));

    await vi.waitFor(() => expect(createOpportunity).toHaveBeenCalledTimes(2));
    expect(chamada(0).get("modo_contato")).toBe("novo");
    expect(chamada(1).get("modo_contato")).toBe("existente");
    expect(chamada(1).get("person_id")).toBe("p9");
    expect(chamada(1).getAll("person_id")).toEqual(["p9"]);
    expect(chamada(1).get(CAMPO_CONFIRMAR_PARECIDO)).toBeNull();
  });

  it("parecido na lixeira: Sim restaura antes de usar", async () => {
    vi.mocked(createOpportunity)
      .mockResolvedValueOnce({ ...COM_PARECIDO, parecidos: [{ ...PARECIDO, naLixeira: true }] })
      .mockResolvedValueOnce(gravou());
    vi.mocked(restorePerson).mockResolvedValue(gravou());
    abrir();
    await preencherContatoNovo();
    fireEvent.click(screen.getByRole("button", { name: "Criar oportunidade" }));

    fireEvent.click(await screen.findByRole("button", { name: /^Restaurar / }));

    await vi.waitFor(() => expect(createOpportunity).toHaveBeenCalledTimes(2));
    expect(vi.mocked(restorePerson).mock.calls[0][0].get("id")).toBe("p9");
    expect(chamada(1).get("person_id")).toBe("p9");
    expect(chamada(1).get("modo_contato")).toBe("existente");
  });

  it("oportunidade existente: Criar outra reenvia com confirmar_outra_oportunidade=1", async () => {
    vi.mocked(createOpportunity)
      .mockResolvedValueOnce(COM_OPORTUNIDADE)
      .mockResolvedValueOnce(gravou());
    abrir();
    fireEvent.change(await screen.findByLabelText("Contato *"), { target: { value: "p2" } });
    fireEvent.change(screen.getByLabelText("Título *"), { target: { value: "O-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar oportunidade" }));

    expect(await screen.findByRole("link", { name: "EB-2 NIW" })).toHaveAttribute("href", "/crm/n1");
    fireEvent.click(screen.getByRole("button", { name: "Criar outra" }));

    await vi.waitFor(() => expect(createOpportunity).toHaveBeenCalledTimes(2));
    expect(chamada(0).get(CAMPO_CONFIRMAR_OPORTUNIDADE)).toBeNull();
    expect(chamada(1).get(CAMPO_CONFIRMAR_OPORTUNIDADE)).toBe("1");
    expect(chamada(1).get("person_id")).toBe("p2");
    expect(chamada(1).get("modo_contato")).toBe("existente");
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("trocar o modo do contato tira o aviso", async () => {
    // Revisão de 18/nov, rodada 2: o aviso continuava oferecendo "Criar
    // mesmo assim" para um contato que já não estava na tela.
    vi.mocked(createOpportunity).mockResolvedValueOnce(COM_PARECIDO);
    abrir();
    await preencherContatoNovo();
    fireEvent.click(screen.getByRole("button", { name: "Criar oportunidade" }));
    await screen.findByRole("button", { name: "Não, é outra pessoa" });

    fireEvent.click(screen.getByRole("button", { name: "Contato existente" }));

    expect(screen.queryByRole("button", { name: "Não, é outra pessoa" })).toBeNull();
  });

  it("restaurar que termina depois de o aviso sumir não envia nada", async () => {
    // Revisão de 18/nov, rodada 3: o "Restaurar" em curso seguia e reenviava
    // com o contato da lixeira, por cima da escolha que estava na tela.
    let soltar: (estado: { error: null; ok: true; token: string }) => void = () => {};
    vi.mocked(createOpportunity).mockResolvedValueOnce({
      ...COM_PARECIDO,
      parecidos: [{ ...PARECIDO, naLixeira: true }],
    });
    vi.mocked(restorePerson).mockImplementation(() => new Promise((resolver) => (soltar = resolver)));
    abrir();
    await preencherContatoNovo();
    fireEvent.click(screen.getByRole("button", { name: "Criar oportunidade" }));

    fireEvent.click(await screen.findByRole("button", { name: /^Restaurar / }));
    fireEvent.click(screen.getByRole("button", { name: "Contato existente" }));
    soltar({ error: null, ok: true, token: "r1" });

    await new Promise((resolver) => setTimeout(resolver, 50));
    expect(createOpportunity).toHaveBeenCalledTimes(1);
  });

  it("Trocar o contato escolhido no aviso tira o aviso seguinte", async () => {
    vi.mocked(createOpportunity)
      .mockResolvedValueOnce(COM_PARECIDO)
      .mockResolvedValueOnce(COM_OPORTUNIDADE);
    abrir();
    await preencherContatoNovo();
    fireEvent.click(screen.getByRole("button", { name: "Criar oportunidade" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Sim, é a mesma pessoa/ }));
    await screen.findByRole("button", { name: "Criar outra" });

    fireEvent.click(screen.getByRole("button", { name: "Trocar" }));

    expect(screen.queryByRole("button", { name: "Criar outra" })).toBeNull();
  });

  it("clicar no modo que já está ativo não tira o aviso", async () => {
    vi.mocked(createOpportunity).mockResolvedValueOnce(COM_OPORTUNIDADE);
    abrir();
    fireEvent.change(await screen.findByLabelText("Contato *"), { target: { value: "p2" } });
    fireEvent.change(screen.getByLabelText("Título *"), { target: { value: "O-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar oportunidade" }));
    await screen.findByRole("button", { name: "Criar outra" });

    fireEvent.click(screen.getByRole("button", { name: "Contato existente" }));

    expect(screen.getByRole("button", { name: "Criar outra" })).toBeInTheDocument();
  });
});
