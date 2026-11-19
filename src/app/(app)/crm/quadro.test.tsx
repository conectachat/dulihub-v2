import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Quadro, type CartaoDoQuadro } from "./quadro";

const acoes = vi.hoisted(() => ({
  moveOpportunity: vi.fn(),
  deleteOpportunity: vi.fn(),
  createOpportunity: vi.fn(),
  ganharOportunidade: vi.fn(),
  perderOportunidade: vi.fn(),
  resumoDoGanho: vi.fn(),
  reabrirOportunidade: vi.fn(),
}));
vi.mock("@/features/opportunities/actions", () => acoes);

const avisos = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("sonner", () => avisos);

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
  itens: [{ amount: 5000, currency: "USD" }],
  stage_id: "novo",
  person: { id: "c1", full_name: "Ana de Teste" },
  processos: [],
  ficha: "sem-link",
};

const ganho: CartaoDoQuadro = { ...cartao, stage_id: "ganho" };

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
  avisos.toast.error.mockReset();
  acoes.moveOpportunity.mockResolvedValue({ error: null, ok: true });
  acoes.resumoDoGanho.mockResolvedValue({ resumo: null, error: "Acrescente pelo menos um visto antes do Ganho." });
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

  it("negócio novo só nas colunas abertas — Ganho e Perdido não têm Adicionar", () => {
    // G5: "Adicionar" em Ganho fazia cliente sem confirmação; em Perdido,
    // perdido sem motivo.
    render(<Quadro etapas={etapas} cartoes={[cartao]} pessoas={[]} />);

    const adicionar = (etapa: string) =>
      within(screen.getByRole("region", { name: `Etapa ${etapa}` })).queryByRole("button", {
        name: /Adicionar/,
      });
    expect(adicionar("Novo Lead")).not.toBeNull();
    expect(adicionar("Ganho")).toBeNull();
    expect(adicionar("Perdido")).toBeNull();
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

  it("soltar em Ganho abre o resumo em vez de mover", async () => {
    render(<Quadro etapas={etapas} cartoes={[cartao]} pessoas={[]} />);

    arrastarPara("Ganho");

    expect(await screen.findByText(/Ganhar negócio/)).toBeTruthy();
    await waitFor(() => expect(acoes.resumoDoGanho).toHaveBeenCalledWith("n1"));
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
    ).toBe("/clientes/c1");
    expect(
      within(coluna).getByRole("link", { name: /Criar processo/ }).getAttribute("href"),
    ).toBe("/clientes/c1?aba=projetos&novo-processo=n1");
    // A âncora vira a aba Dados: o perfil de cliente tem abas (D6).
    expect(
      within(coluna).getByRole("link", { name: /Ficha conferida/ }).getAttribute("href"),
    ).toBe("/clientes/c1?aba=dados");
  });

  it("o cartão mostra os totais por moeda dos vistos", () => {
    render(
      <Quadro
        etapas={etapas}
        cartoes={[{ ...cartao, itens: [{ amount: 5000, currency: "USD" }, { amount: 1000, currency: "BRL" }] }]}
        pessoas={[]}
      />,
    );
    const artigo = screen.getByRole("article", { name: /Processo EB-2 NIW/ });
    expect(within(artigo).getByText(/R\$\s1\.000 e US\$\s5\.000/)).toBeTruthy();
  });

  it("as colunas Ganho e Perdido dizem que mostram só os últimos 30 dias", () => {
    render(<Quadro etapas={etapas} cartoes={[cartao]} pessoas={[]} />);
    const coluna = (nome: string) => within(screen.getByRole("region", { name: `Etapa ${nome}` }));
    expect(coluna("Ganho").getByText("últimos 30 dias")).toBeTruthy();
    expect(coluna("Perdido").getByText("últimos 30 dias")).toBeTruthy();
    expect(coluna("Novo Lead").queryByText("últimos 30 dias")).toBeNull();
  });

  it("cartão ganho não tem Excluir: o negócio ganho fica como registro", () => {
    render(<Quadro etapas={etapas} cartoes={[cartao, { ...ganho, id: "n2", title: "Negócio ganho" }]} pessoas={[]} />);
    expect(screen.getByRole("button", { name: "Excluir Processo EB-2 NIW" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Excluir Negócio ganho" })).toBeNull();
  });

  it("soltar um ganho numa etapa aberta pede para reabrir, e diz para onde volta", async () => {
    render(<Quadro etapas={etapas} cartoes={[ganho]} pessoas={[]} />);

    arrastarPara("Proposta");

    expect(await screen.findByText("Reabrir este negócio?")).toBeTruthy();
    expect(screen.getByText("Ele volta para Novo Lead.")).toBeTruthy();
    expect(acoes.moveOpportunity).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByText("Reabrir este negócio?")).toBeNull());
    expect(acoes.reabrirOportunidade).not.toHaveBeenCalled();
  });

  it("soltar um ganho em Perdido não move: reabra antes", () => {
    render(<Quadro etapas={etapas} cartoes={[ganho]} pessoas={[]} />);

    arrastarPara("Perdido");

    expect(avisos.toast.error).toHaveBeenCalledWith("Reabra o negócio antes.");
    expect(screen.queryByLabelText("Motivo *")).toBeNull();
    expect(acoes.moveOpportunity).not.toHaveBeenCalled();
  });

  it("reabrir recusado pelo banco mostra a frase, e o cartão continua no Ganho", async () => {
    acoes.reabrirOportunidade.mockResolvedValue({
      error: "Só o dono do negócio ou a gestão reabrem o negócio.",
    });
    render(<Quadro etapas={etapas} cartoes={[ganho]} pessoas={[]} />);

    arrastarPara("Proposta");
    fireEvent.click(await screen.findByRole("button", { name: "Reabrir" }));

    expect(
      await screen.findByText("Só o dono do negócio ou a gestão reabrem o negócio."),
    ).toBeTruthy();
    expect(acoes.reabrirOportunidade.mock.calls[0][0].get("id")).toBe("n1");
    // O diálogo segue aberto com a frase, e esconde o quadro dos leitores de
    // tela: `hidden` procura atrás dele.
    const colunaGanho = screen.getByRole("region", { name: "Etapa Ganho", hidden: true });
    expect(
      within(colunaGanho).getByRole("article", { name: /Processo EB-2 NIW/, hidden: true }),
    ).toBeTruthy();
  });

  it("ganho com um processo abre o processo; com mais de um, a aba Projetos do cliente", () => {
    const { unmount } = render(
      <Quadro etapas={etapas} cartoes={[{ ...ganho, processos: ["p1"] }]} pessoas={[]} />,
    );
    expect(screen.getByRole("link", { name: "Ver processo" }).getAttribute("href")).toBe("/projetos/p1");
    unmount();

    render(<Quadro etapas={etapas} cartoes={[{ ...ganho, processos: ["p1", "p2"] }]} pessoas={[]} />);
    expect(screen.getByRole("link", { name: "Ver processos" }).getAttribute("href")).toBe(
      "/clientes/c1?aba=projetos",
    );
  });
});
