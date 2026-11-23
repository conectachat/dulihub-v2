import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FormaParaOCliente } from "@/lib/forma-do-cliente";

/**
 * "Enviar ficha" com a forma de pagamento (entrega 4b; FIC-7, FIC-13): a
 * prévia mostra exatamente o que o cliente vai ver — o mesmo componente da
 * ficha pública — e só depois de "Confirmar e gerar link" o link nasce. A
 * versão vai como foi lida (foco 1).
 */

vi.mock("@/features/opportunities/forma-actions", () => ({
  enviarFormaDePagamento: vi.fn(async () => ({ error: null, ok: true, token: "t" })),
}));

const { enviarFormaDePagamento } = await import("@/features/opportunities/forma-actions");
const { EnviarFicha } = await import("./enviar-ficha");

const VERSAO = "2026-11-23T14:02:11.123456+00:00";

const FORMA: FormaParaOCliente = {
  vistos: [{ visa_name: "EB-2 NIW", amount: 6000, currency: "USD" }],
  partes: [
    {
      label: "Cartão",
      method: "cartao",
      currency: "BRL",
      total: 21527.76,
      usd_equivalent: 3900,
      parcelas: [{ number: 1, amount: 21527.76, due_on: "2099-12-15" }],
    },
  ],
};

function abrir(props: Partial<Parameters<typeof EnviarFicha>[0]> = {}) {
  render(
    <EnviarFicha
      negocioId="11111111-1111-4111-8111-111111111111"
      pessoaId="22222222-2222-4222-8222-222222222222"
      versao={VERSAO}
      forma={FORMA}
      jaMandouFicha={false}
      fichaComumAbertaEm={null}
      {...props}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Enviar ficha" }));
}

const texto = () => (document.body.textContent ?? "").replaceAll(" ", " ");

beforeEach(() => vi.clearAllMocks());

describe("EnviarFicha", () => {
  it("a prévia é o que o cliente vai ver, com a conversão (FIC-13)", () => {
    abrir();
    expect(texto()).toContain("US$ 3.900 convertidos para R$ 21.527,76");
    expect(texto()).toContain("EB-2 NIW");
  });

  it("pedir os dados de novo só aparece para quem já mandou a ficha (P12)", () => {
    abrir();
    expect(screen.queryByLabelText(/Pedir os dados pessoais de novo/)).toBeNull();
  });

  it("com a ficha já mandada, a caixa aparece, desmarcada", () => {
    abrir({ jaMandouFicha: true });
    const caixa = screen.getByLabelText(/Pedir os dados pessoais de novo/) as HTMLInputElement;
    expect(caixa.checked).toBe(false);
  });

  it("avisa que a ficha comum aberta deixa de valer", () => {
    abrir({ fichaComumAbertaEm: "2026-11-20T15:00:00Z" });
    expect(texto()).toContain("O link da ficha enviado em 20/11/2026 deixa de valer.");
  });

  it("avisa da parcela já vencida, sem bloquear", () => {
    abrir({
      forma: {
        ...FORMA,
        partes: [{ ...FORMA.partes[0]!, parcelas: [{ number: 1, amount: 21527.76, due_on: "2000-01-01" }] }],
      },
    });
    expect(texto()).toContain("1 parcela já vencida");
  });

  it("Confirmar e gerar link leva a versão exatamente como veio (foco 1)", async () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar e gerar link" }));

    await vi.waitFor(() => expect(enviarFormaDePagamento).toHaveBeenCalledTimes(1));
    const formData = vi.mocked(enviarFormaDePagamento).mock.calls[0]![1] as FormData;
    expect(formData.get("versao")).toBe(VERSAO);
    expect(formData.get("negocio")).toBe("11111111-1111-4111-8111-111111111111");
    expect(formData.get("pessoa")).toBe("22222222-2222-4222-8222-222222222222");
  });
});
