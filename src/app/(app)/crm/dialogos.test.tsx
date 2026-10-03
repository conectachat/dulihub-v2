import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DialogoDeGanho, DialogoDePerda } from "./dialogos";

const acoes = vi.hoisted(() => ({
  ganharOportunidade: vi.fn(),
  perderOportunidade: vi.fn(),
}));
vi.mock("@/features/opportunities/actions", () => acoes);

/**
 * As duas saídas do funil. O Ganho diz a consequência antes de gravar; o
 * Perdido não grava sem motivo. São os mesmos diálogos no botão da tela do
 * lead e no cartão solto na coluna — arrastar não pula nenhum dos dois.
 */

const negocio = { id: "n1", cliente: "Ana de Teste" };

beforeEach(() => {
  acoes.ganharOportunidade.mockReset();
  acoes.perderOportunidade.mockReset();
});

describe("DialogoDeGanho", () => {
  it("diz o que muda antes de gravar: vira cliente, e não volta", () => {
    render(<DialogoDeGanho negocio={negocio} aberto aoMudar={() => {}} />);

    expect(screen.getByText(/contrato estiver assinado/)).toBeTruthy();
    expect(screen.getByText(/Ana de Teste passa a ser\s+cliente/)).toBeTruthy();
    expect(screen.getByText(/não volta a ser lead/)).toBeTruthy();
  });

  it("confirmado, grava o negócio certo; recusa aparece no diálogo", async () => {
    acoes.ganharOportunidade.mockResolvedValueOnce({ error: "O funil não tem etapa de ganho." });
    render(<DialogoDeGanho negocio={negocio} aberto aoMudar={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Marcar como ganho" }));

    expect(await screen.findByText("O funil não tem etapa de ganho.")).toBeTruthy();
    expect(acoes.ganharOportunidade.mock.calls[0][0].get("id")).toBe("n1");
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
