import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Quadro, type CartaoDoQuadro } from "./quadro";

const acoes = vi.hoisted(() => ({
  moveOpportunity: vi.fn(),
  deleteOpportunity: vi.fn(),
  createOpportunity: vi.fn(),
  ganharOportunidade: vi.fn(),
  perderOportunidade: vi.fn(),
}));
vi.mock("@/features/opportunities/actions", () => acoes);

/**
 * O quadro do funil: arrastar um cartão entre colunas, e o seletor que
 * continua ali para o celular e o teclado.
 *
 * O que importa provar é que os dois caminhos passam pela mesma porta: soltar
 * (ou escolher) Ganho pede a confirmação, Perdido pede o motivo, e nenhum dos
 * dois move direto.
 */

const etapas = [
  { id: "novo", name: "Novo Lead", position: 0, probability: null, is_won: false, is_lost: false },
  { id: "proposta", name: "Proposta", position: 1, probability: null, is_won: false, is_lost: false },
  { id: "ganho", name: "Ganho", position: 98, probability: null, is_won: true, is_lost: false },
  { id: "perdido", name: "Perdido", position: 99, probability: null, is_won: false, is_lost: true },
];

const cartao: CartaoDoQuadro = {
  id: "n1",
  title: "Processo EB-2 NIW",
  value: 5000,
  currency: "USD",
  stage_id: "novo",
  person: { id: "c1", full_name: "Ana de Teste" },
  processoId: null,
  ficha: "sem-link",
};

/** O `dataTransfer` que o jsdom não traz. */
function transferencia() {
  const dados = new Map<string, string>();
  return {
    setData: (tipo: string, valor: string) => void dados.set(tipo, valor),
    getData: (tipo: string) => dados.get(tipo) ?? "",
    effectAllowed: "",
    dropEffect: "",
  };
}

function arrastarPara(nomeDaEtapa: string) {
  const dataTransfer = transferencia();
  const origem = screen.getByRole("article", { name: /Processo EB-2 NIW/ });
  const destino = screen.getByRole("region", { name: `Etapa ${nomeDaEtapa}` });

  fireEvent.dragStart(origem, { dataTransfer });
  fireEvent.dragOver(destino, { dataTransfer });
  fireEvent.drop(destino, { dataTransfer });
  fireEvent.dragEnd(origem, { dataTransfer });
}

beforeEach(() => {
  for (const acao of Object.values(acoes)) acao.mockReset();
  acoes.moveOpportunity.mockResolvedValue({ error: null, ok: true });
});

describe("Quadro", () => {
  it("põe cada cartão na coluna da etapa dele, e o cartão abre a tela do lead", () => {
    render(<Quadro etapas={etapas} cartoes={[cartao]} pessoas={[]} />);

    const coluna = screen.getByRole("region", { name: "Etapa Novo Lead" });
    const titulo = within(coluna).getByRole("link", { name: "Processo EB-2 NIW" });
    expect(titulo.getAttribute("href")).toBe("/crm/n1");

    // A contagem e a soma da coluna saem dos cartões que estão nela.
    expect(within(coluna).getByText(/1 ·/)).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Etapa Proposta" })).getByText("Vazia"),
    ).toBeTruthy();
  });

  it("arrastar para outra etapa move o negócio", async () => {
    render(<Quadro etapas={etapas} cartoes={[cartao]} pessoas={[]} />);

    arrastarPara("Proposta");

    await waitFor(() => expect(acoes.moveOpportunity).toHaveBeenCalledTimes(1));
    const enviado = acoes.moveOpportunity.mock.calls[0][0] as FormData;
    expect(enviado.get("id")).toBe("n1");
    expect(enviado.get("stage_id")).toBe("proposta");
  });

  it("soltar na mesma coluna não faz nada", () => {
    render(<Quadro etapas={etapas} cartoes={[cartao]} pessoas={[]} />);

    arrastarPara("Novo Lead");

    expect(acoes.moveOpportunity).not.toHaveBeenCalled();
  });

  it("soltar em Ganho pede a confirmação em vez de mover", async () => {
    render(<Quadro etapas={etapas} cartoes={[cartao]} pessoas={[]} />);

    arrastarPara("Ganho");

    expect(await screen.findByText("Marcar como ganho?")).toBeTruthy();
    expect(screen.getByText(/Ana de Teste passa a ser\s+cliente/)).toBeTruthy();
    expect(acoes.moveOpportunity).not.toHaveBeenCalled();
    expect(acoes.ganharOportunidade).not.toHaveBeenCalled();
  });

  it("soltar em Perdido pede o motivo em vez de mover", async () => {
    render(<Quadro etapas={etapas} cartoes={[cartao]} pessoas={[]} />);

    arrastarPara("Perdido");

    expect(await screen.findByLabelText("Motivo *")).toBeTruthy();
    expect(acoes.moveOpportunity).not.toHaveBeenCalled();
  });

  it("o seletor do cartão passa pela mesma porta", async () => {
    render(<Quadro etapas={etapas} cartoes={[cartao]} pessoas={[]} />);
    const seletor = screen.getByLabelText("Mover para outra etapa");

    fireEvent.change(seletor, { target: { value: "perdido" } });
    expect(await screen.findByLabelText("Motivo *")).toBeTruthy();
    expect(acoes.moveOpportunity).not.toHaveBeenCalled();

    fireEvent.change(seletor, { target: { value: "proposta" } });
    await waitFor(() => expect(acoes.moveOpportunity).toHaveBeenCalledTimes(1));
  });

  it("negócio ganho abre o perfil do cliente e oferece o processo", () => {
    render(
      <Quadro
        etapas={etapas}
        cartoes={[{ ...cartao, stage_id: "ganho", ficha: "conferida" }]}
        pessoas={[]}
      />,
    );

    const coluna = screen.getByRole("region", { name: "Etapa Ganho" });
    expect(
      within(coluna).getByRole("link", { name: "Processo EB-2 NIW" }).getAttribute("href"),
    ).toBe("/contatos/c1");
    expect(
      within(coluna).getByRole("link", { name: /Criar processo/ }).getAttribute("href"),
    ).toBe("/contatos/c1?novo-processo=n1");
  });
});
