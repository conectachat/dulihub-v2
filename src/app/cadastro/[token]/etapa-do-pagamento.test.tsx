import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FormaParaOCliente } from "@/lib/forma-do-cliente";

import { EtapaDoPagamento } from "./etapa-do-pagamento";

const responderForma = vi.hoisted(() => vi.fn());
vi.mock("@/features/cadastro/publico-actions", () => ({ responderForma }));

/**
 * O pagamento na mão do cliente (entrega 4b; FIC-8, FIC-9): ele lê a forma —
 * a mesma que a equipe viu na prévia — e responde Confirmo ou Há algo errado.
 * As frases finais levam o nome da organização dona do link, não "Duli".
 */

const FORMA: FormaParaOCliente = {
  vistos: [{ visa_name: "EB-2 NIW", amount: 6000, currency: "USD" }],
  partes: [
    {
      label: "Cartão",
      method: "cartao",
      currency: "BRL",
      total: 21527.76,
      usd_equivalent: 3900,
      parcelas: [{ number: 1, amount: 21527.76, due_on: "2026-12-15" }],
    },
  ],
};

const ORGANIZACAO = "Parceiro de Teste";

function desenhar(soPagamento = false) {
  render(<EtapaDoPagamento token="tok" forma={FORMA} organizacao={ORGANIZACAO} soPagamento={soPagamento} />);
}

const texto = () => (document.body.textContent ?? "").replaceAll(" ", " ");

beforeEach(() => vi.clearAllMocks());

describe("EtapaDoPagamento", () => {
  it("mostra a forma, com a conversão, e os dois botões", () => {
    desenhar();
    expect(texto()).toContain("US$ 3.900 convertidos para R$ 21.527,76");
    expect(screen.getByRole("button", { name: "Confirmo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Há algo errado" })).toBeTruthy();
    expect(texto()).toContain("Passo 2 de 2");
  });

  it("no link só do pagamento, diz que os dados já chegaram", () => {
    desenhar(true);
    expect(texto()).toContain("Seus dados já foram recebidos ✓");
    expect(texto()).not.toContain("Passo 2 de 2");
  });

  it("Confirmo: responde e agradece com o nome do parceiro, não Duli", async () => {
    responderForma.mockResolvedValueOnce({ error: null });
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Confirmo" }));

    expect(
      await screen.findByText(
        `Obrigado! A ${ORGANIZACAO} vai preparar o seu contrato e enviar para assinatura.`,
      ),
    ).toBeTruthy();
    expect(responderForma).toHaveBeenCalledWith("tok", true, "");
    expect(texto()).not.toContain("Duli");
  });

  it("Há algo errado: o motivo vai junto, e a frase final é a da recusa", async () => {
    responderForma.mockResolvedValueOnce({ error: null });
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Há algo errado" }));
    const motivo = screen.getByLabelText(/O que está errado/) as HTMLTextAreaElement;
    expect(motivo.maxLength).toBe(500);
    fireEvent.change(motivo, { target: { value: "A data do cartão" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(
      await screen.findByText(
        `Recebemos. A ${ORGANIZACAO} vai rever a forma de pagamento e enviar um novo link.`,
      ),
    ).toBeTruthy();
    expect(responderForma).toHaveBeenCalledWith("tok", false, "A data do cartão");
  });

  it("erro do servidor aparece, e a escolha continua na tela", async () => {
    responderForma.mockResolvedValueOnce({ error: "Este link não está mais disponível." });
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Confirmo" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Este link não está mais disponível.");
    expect(screen.getByRole("button", { name: "Confirmo" })).toBeTruthy();
  });
});
