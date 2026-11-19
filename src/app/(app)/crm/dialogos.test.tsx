import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DialogoDeGanho, DialogoDePerda, DialogoDeReabrir } from "./dialogos";

const acoes = vi.hoisted(() => ({
  ganharOportunidade: vi.fn(),
  perderOportunidade: vi.fn(),
  resumoDoGanho: vi.fn(),
  reabrirOportunidade: vi.fn(),
}));
vi.mock("@/features/opportunities/actions", () => acoes);

/**
 * As duas saídas do funil. O Ganho diz a consequência antes de gravar; o
 * Perdido não grava sem motivo. São os mesmos diálogos no botão da tela do
 * lead e no cartão solto na coluna — arrastar não pula nenhum dos dois.
 */

const negocio = { id: "n1", cliente: "Ana de Teste" };

const RESUMO = {
  negocio: "n1",
  pessoa: { id: "c1", nome: "Ana de Teste", vira_cliente: true },
  itens: [
    { id: "i1", visa_name: "EB-1A", amount: 8000, currency: "USD" },
    { id: "i2", visa_name: "O-1", amount: 6000, currency: "USD" },
  ],
  processos: [
    { item: "i1", titulo: "EB-1A — Ana de Teste", id: null },
    { item: "i2", titulo: "O-1 — Ana de Teste", id: null },
  ],
  cobrancas: [],
  avisos: [],
};

beforeEach(() => {
  for (const acao of Object.values(acoes)) acao.mockReset();
  acoes.resumoDoGanho.mockResolvedValue({ resumo: RESUMO, error: null });
});

describe("DialogoDeGanho", () => {
  it("mostra o resumo antes de gravar: vistos, total, pagamento e o que vai acontecer", async () => {
    render(<DialogoDeGanho negocio={negocio} aberto aoMudar={() => {}} />);

    expect(await screen.findByText("EB-1A")).toBeTruthy();
    expect(acoes.resumoDoGanho).toHaveBeenCalledWith("n1");
    expect(screen.getByText("O-1")).toBeTruthy();
    const totais = within(screen.getByRole("group", { name: "Totais por moeda" }));
    expect(totais.getByText(/US\$\s14\.000/)).toBeTruthy();
    expect(screen.getByText("Forma de pagamento: definir na aba Financeiro")).toBeTruthy();
    expect(screen.getByText("Ana de Teste passa a ser cliente")).toBeTruthy();
    expect(
      screen.getByText("Serão criados 2 processos: EB-1A — Ana de Teste; O-1 — Ana de Teste"),
    ).toBeTruthy();
    expect(screen.getByText("Nenhuma cobrança será criada.")).toBeTruthy();
  });

  it("quem já é cliente não ganha a linha de 'passa a ser cliente'", async () => {
    acoes.resumoDoGanho.mockResolvedValue({
      resumo: { ...RESUMO, pessoa: { ...RESUMO.pessoa, vira_cliente: false } },
      error: null,
    });
    render(<DialogoDeGanho negocio={negocio} aberto aoMudar={() => {}} />);

    expect(await screen.findByText("EB-1A")).toBeTruthy();
    expect(screen.queryByText("Ana de Teste passa a ser cliente")).toBeNull();
  });

  it("sem processo novo, diz que nenhum processo novo será criado", async () => {
    acoes.resumoDoGanho.mockResolvedValue({ resumo: { ...RESUMO, processos: [] }, error: null });
    render(<DialogoDeGanho negocio={negocio} aberto aoMudar={() => {}} />);

    expect(await screen.findByText("Nenhum processo novo.")).toBeTruthy();
  });

  it("resumo recusado mostra a frase e não oferece Confirmar", async () => {
    acoes.resumoDoGanho.mockResolvedValue({
      resumo: null,
      error: "Acrescente pelo menos um visto antes do Ganho.",
    });
    render(<DialogoDeGanho negocio={negocio} aberto aoMudar={() => {}} />);

    expect(await screen.findByText("Acrescente pelo menos um visto antes do Ganho.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirmar Ganho" })).toBeNull();
  });

  it("confirmado, grava o negócio certo; recusa aparece no diálogo", async () => {
    acoes.ganharOportunidade.mockResolvedValueOnce({ error: "O funil não tem etapa de ganho." });
    render(<DialogoDeGanho negocio={negocio} aberto aoMudar={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "Confirmar Ganho" }));

    expect(await screen.findByText("O funil não tem etapa de ganho.")).toBeTruthy();
    expect(acoes.ganharOportunidade.mock.calls[0][0].get("id")).toBe("n1");
  });
});

describe("DialogoDeReabrir", () => {
  it("pergunta e diz para onde o negócio volta; Cancelar não grava", () => {
    const aoMudar = vi.fn();
    render(<DialogoDeReabrir negocio={negocio} destino="Novo Lead" aberto aoMudar={aoMudar} />);

    expect(screen.getByText("Reabrir este negócio?")).toBeTruthy();
    expect(screen.getByText("Ele volta para Novo Lead.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoMudar).toHaveBeenCalledWith(false);
    expect(acoes.reabrirOportunidade).not.toHaveBeenCalled();
  });

  it("confirmado, reabre o negócio certo e fecha", async () => {
    acoes.reabrirOportunidade.mockResolvedValueOnce({ error: null, ok: true });
    const aoMudar = vi.fn();
    render(<DialogoDeReabrir negocio={negocio} destino="Novo Lead" aberto aoMudar={aoMudar} />);

    fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));

    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
    expect(acoes.reabrirOportunidade.mock.calls[0][0].get("id")).toBe("n1");
  });
});

describe("DialogoDePerda", () => {
  const enviar = () =>
    fireEvent.click(screen.getByRole("button", { name: "Marcar como perdido" }));

  it("sem motivo não grava", async () => {
    render(<DialogoDePerda negocio={negocio} aberto aoMudar={() => {}} />);

    enviar();

    expect(await screen.findByText("Escolha o motivo.")).toBeTruthy();
    expect(acoes.perderOportunidade).not.toHaveBeenCalled();
  });

  it("“Outro” exige o detalhe", async () => {
    render(<DialogoDePerda negocio={negocio} aberto aoMudar={() => {}} />);

    fireEvent.change(screen.getByLabelText("Motivo *"), { target: { value: "outro" } });
    enviar();

    expect(await screen.findByText("Escreva o que aconteceu.")).toBeTruthy();
    expect(acoes.perderOportunidade).not.toHaveBeenCalled();
  });

  it("com motivo, grava e fecha", async () => {
    acoes.perderOportunidade.mockResolvedValueOnce({ error: null, ok: true });
    const aoMudar = vi.fn();
    render(<DialogoDePerda negocio={negocio} aberto aoMudar={aoMudar} />);

    fireEvent.change(screen.getByLabelText("Motivo *"), { target: { value: "preco" } });
    fireEvent.change(screen.getByLabelText("Detalhe (opcional)"), {
      target: { value: "achou caro" },
    });
    enviar();

    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
    const enviado = acoes.perderOportunidade.mock.calls[0][1] as FormData;
    expect(enviado.get("id")).toBe("n1");
    expect(enviado.get("motivo")).toBe("preco");
    expect(enviado.get("detalhe")).toBe("achou caro");
  });

  it("recusa do servidor aparece e não apaga o que foi escrito", async () => {
    acoes.perderOportunidade.mockResolvedValueOnce({ error: "Nada foi alterado." });
    const aoMudar = vi.fn();
    render(<DialogoDePerda negocio={negocio} aberto aoMudar={aoMudar} />);

    fireEvent.change(screen.getByLabelText("Motivo *"), { target: { value: "preco" } });
    enviar();

    expect(await screen.findByText("Nada foi alterado.")).toBeTruthy();
    expect((screen.getByLabelText("Motivo *") as HTMLSelectElement).value).toBe("preco");
    expect(aoMudar).not.toHaveBeenCalled();
  });
});
