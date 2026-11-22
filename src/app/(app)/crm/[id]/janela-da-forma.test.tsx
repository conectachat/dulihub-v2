import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";
import type { ParteDaForma } from "@/features/opportunities/forma-regras";
import { formatarMoeda as moeda } from "@/lib/totals";

/** O valor como a tela o lê: o espaço rígido de `Intl` vira espaço comum na comparação. */
const formatarMoeda = (valor: number, m: string) => moeda(valor, m).replace(/\s/g, " ");

/**
 * A janela da forma de pagamento (entrega 4a; FIC-7). O estado das partes fica
 * no navegador e vai num campo escondido. A forma inválida não sai da janela
 * (P12): Salvar continua clicável, mostra a frase e não chama o servidor.
 * Campo vazio no meio da digitação nunca derruba a janela (foco 2).
 */

vi.mock("@/features/opportunities/forma-actions", () => ({
  salvarFormaDePagamento: vi.fn(async () => ({ error: null, ok: true, token: "t" })),
}));

const { salvarFormaDePagamento } = await import("@/features/opportunities/forma-actions");
const { JanelaDaForma } = await import("./janela-da-forma");

const VISTOS_EM_DOLAR = [
  { visa_name: "EB-1A", amount: 8000, currency: "USD" },
  { visa_name: "O-1", amount: 6000, currency: "USD" },
];

function abrir(partes: ParteDaForma[] = [], itens = VISTOS_EM_DOLAR) {
  render(
    <JanelaDaForma
      negocioId="11111111-1111-4111-8111-111111111111"
      nomeDaPessoa="Maria Souza"
      itens={itens}
      partes={partes}
      gatilho={<Button>Definir forma de pagamento</Button>}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Definir forma de pagamento" }));
}

const campo = (rotulo: string) => screen.getByLabelText(rotulo) as HTMLInputElement;
const parcelasDa = (parte: number) =>
  screen.queryAllByLabelText(new RegExp(`^Valor da parcela \\d+ da parte ${parte}$`));

beforeEach(() => vi.clearAllMocks());

describe("JanelaDaForma", () => {
  it("+ Parcelas gera 3 parcelas, na moeda dos vistos", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Parcelas" }));

    expect(parcelasDa(1)).toHaveLength(3);
    expect((screen.getByLabelText("Moeda da parte 1") as HTMLSelectElement).value).toBe("USD");
  });

  it("mudar o total para 9000 gera de novo 3 × 3000", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Parcelas" }));

    fireEvent.change(campo("Total da parte 1"), { target: { value: "9000" } });

    expect(parcelasDa(1).map((c) => (c as HTMLInputElement).value)).toEqual([
      "3000",
      "3000",
      "3000",
    ]);
  });

  it("apagar o número de parcelas não derruba a janela; digitar 12 gera 12", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Parcelas" }));
    fireEvent.change(campo("Total da parte 1"), { target: { value: "9000" } });

    fireEvent.change(campo("Parcelas da parte 1"), { target: { value: "" } });
    expect(campo("Parcelas da parte 1").value).toBe("");
    expect(parcelasDa(1)).toHaveLength(0);
    expect(screen.getByText("Parcelas vão de 1 a 36.")).toBeTruthy();

    fireEvent.change(campo("Parcelas da parte 1"), { target: { value: "12" } });
    expect(parcelasDa(1)).toHaveLength(12);
    expect(screen.queryByText("Parcelas vão de 1 a 36.")).toBeNull();
  });

  it("limpar a 1ª data não derruba a janela: as parcelas somem e a frase aparece", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Parcelas" }));
    fireEvent.change(campo("Total da parte 1"), { target: { value: "9000" } });

    fireEvent.change(campo("1ª data da parte 1"), { target: { value: "" } });

    expect(parcelasDa(1)).toHaveLength(0);
    expect(screen.getByText("A data da parcela 1 de Parcelas não é válida.")).toBeTruthy();
  });

  it("trocar uma parte Parcelas para cartão a deixa com 1 pagamento, sem número de parcelas", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Parcelas" }));
    fireEvent.change(campo("Total da parte 1"), { target: { value: "9000" } });

    fireEvent.change(screen.getByLabelText("Método da parte 1"), { target: { value: "cartao" } });

    expect(screen.queryByLabelText("Parcelas da parte 1")).toBeNull();
    expect(parcelasDa(1)).toHaveLength(0);
    expect(screen.queryByText(/não bate|vão de 1 a 36/)).toBeNull();
  });

  it("+ Cartão não mostra número de parcelas", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Cartão" }));

    expect(screen.getByLabelText("Total da parte 1")).toBeTruthy();
    expect(screen.queryByLabelText("Parcelas da parte 1")).toBeNull();
  });

  it("parcela editada para 2999,99: a frase da soma aparece, e Salvar não chama o servidor", async () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Parcelas" }));
    fireEvent.change(campo("Total da parte 1"), { target: { value: "9000" } });

    fireEvent.change(campo("Valor da parcela 3 da parte 1"), { target: { value: "2999,99" } });

    const frase =
      `As parcelas de Parcelas somam ${formatarMoeda(8999.99, "USD")}; ` +
      `o total é ${formatarMoeda(9000, "USD")}.`;
    expect(screen.getByText(frase)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    // Junto da parte e no rodapé do formulário.
    await vi.waitFor(() => expect(screen.getAllByText(frase)).toHaveLength(2));
    expect(salvarFormaDePagamento).not.toHaveBeenCalled();
  });

  it("com 10 partes, os botões de parte ficam desabilitados", () => {
    abrir();
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByRole("button", { name: "Entrada" }));

    for (const nome of ["Entrada", "Parcelas", "Cartão", "À vista"]) {
      expect((screen.getByRole("button", { name: nome }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("US$ 13.000 contra vistos de US$ 14.000: o aviso de coerência", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "À vista" }));
    fireEvent.change(campo("Total da parte 1"), { target: { value: "13000" } });

    expect(
      screen.getByText(
        `A forma soma ${formatarMoeda(13000, "USD")} e os vistos, ${formatarMoeda(14000, "USD")}.`,
      ),
    ).toBeTruthy();
  });

  it("real e dólar: os dois totais, sem aviso", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Entrada" }));
    fireEvent.change(screen.getByLabelText("Moeda da parte 1"), { target: { value: "BRL" } });
    fireEvent.change(campo("Total da parte 1"), { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: "Parcelas" }));
    fireEvent.change(campo("Total da parte 2"), { target: { value: "9000" } });

    expect(
      screen.getByText(
        `Total da forma: ${formatarMoeda(10000, "BRL")} + ${formatarMoeda(9000, "USD")}`,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/A forma soma/)).toBeNull();
  });

  it("Salvar com a forma válida chama a ação com o JSON das partes", async () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Parcelas" }));
    fireEvent.change(campo("Total da parte 1"), { target: { value: "9000" } });
    fireEvent.change(campo("1ª data da parte 1"), { target: { value: "2026-12-10" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await vi.waitFor(() => expect(salvarFormaDePagamento).toHaveBeenCalledTimes(1));
    const formData = vi.mocked(salvarFormaDePagamento).mock.calls[0]![1] as FormData;
    expect(formData.get("negocio")).toBe("11111111-1111-4111-8111-111111111111");
    expect(JSON.parse(String(formData.get("forma")))).toEqual({
      partes: [
        {
          label: "Parcelas",
          method: "transferencia",
          currency: "USD",
          total: 9000,
          installments_count: 3,
          parcelas: [
            { number: 1, amount: 3000, due_on: "2026-12-10" },
            { number: 2, amount: 3000, due_on: "2027-01-10" },
            { number: 3, amount: 3000, due_on: "2027-02-10" },
          ],
        },
      ],
    });
  });

  it("abre com as partes gravadas, para editar", () => {
    abrir([
      {
        label: "Entrada",
        method: "pix",
        currency: "BRL",
        total: 10000,
        installments_count: 1,
        parcelas: [{ number: 1, amount: 10000, due_on: "2026-11-10" }],
      },
    ]);

    const dialogo = screen.getByRole("dialog");
    expect((within(dialogo).getByLabelText("Nome da parte 1") as HTMLInputElement).value).toBe(
      "Entrada",
    );
    expect(campo("Total da parte 1").value).toBe("10000");
    expect(campo("1ª data da parte 1").value).toBe("2026-11-10");
  });
});
