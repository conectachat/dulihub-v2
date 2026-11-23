import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FormaDoNegocio } from "@/features/opportunities/montagem";
import { formatarMoeda as moeda } from "@/lib/totals";

/** O valor como a tela o lê: o espaço rígido de `Intl` vira espaço comum na comparação. */
const formatarMoeda = (valor: number, m: string) => moeda(valor, m).replace(/\s/g, " ");

/**
 * O cartão "Forma de pagamento" da tela do lead (entrega 4a; FIC-7, FIC-10,
 * FIC-11, FIC-12): o que aparece em cada estado e para quem. Quem decide é o
 * banco (0058); aqui se prova só o que a tela mostra.
 */

vi.mock("@/features/opportunities/forma-actions", () => ({
  salvarFormaDePagamento: vi.fn(async () => ({ error: null, ok: true, token: "t" })),
  confirmarFormaPelaEquipe: vi.fn(async () => ({ error: null, ok: true, token: "t" })),
  voltarFormaParaRascunho: vi.fn(async () => ({ error: null, ok: true, token: "t" })),
  enviarFormaDePagamento: vi.fn(async () => ({ error: null, ok: true, token: "t" })),
  salvarCotacao: vi.fn(async () => ({ error: null, ok: true, token: "t" })),
}));

const { salvarCotacao } = await import("@/features/opportunities/forma-actions");
const { CartaoDaFormaDePagamento } = await import("./forma-de-pagamento");

const ITENS = [
  { visa_name: "EB-1A", amount: 8000, currency: "USD" },
  { visa_name: "O-1", amount: 6000, currency: "USD" },
];

/** A forma do critério: entrada no pix em real e 3 transferências em dólar. */
const DO_CRITERIO: FormaDoNegocio = {
  id: "plano-1",
  status: "rascunho",
  updated_at: "2026-11-23T14:02:11.123456+00:00",
  reference_rate: null,
  reference_rate_note: null,
  charges_created_at: null,
  partes: [
    {
      label: "Entrada",
      method: "pix",
      currency: "BRL",
      total: 10000,
      installments_count: 1,
      usd_equivalent: null,
      parcelas: [{ number: 1, amount: 10000, due_on: "2026-11-10" }],
    },
    {
      label: "Parcelas",
      method: "transferencia",
      currency: "USD",
      total: 9000,
      installments_count: 3,
      usd_equivalent: null,
      parcelas: [
        { number: 1, amount: 3000, due_on: "2026-12-10" },
        { number: 2, amount: 3000, due_on: "2027-01-10" },
        { number: 3, amount: 3000, due_on: "2027-02-10" },
      ],
    },
  ],
  ultimaResposta: null,
  linkAberto: null,
};

const CONFIRMADA: FormaDoNegocio = {
  ...DO_CRITERIO,
  status: "confirmada",
  ultimaResposta: {
    answered_at: "2026-11-05T15:00:00Z",
    answered_by_name: "Ana Lima",
    reason: "acertado por WhatsApp",
    decision: "confirmada_pela_equipe",
  },
};

/** Terça, 24/11/2026, meio-dia em São Paulo. */
const AGORA = new Date("2026-11-24T15:00:00Z");

/** O link enviado na segunda, 23/11: vale até quinta, 26/11 (o banco grava sexta, 00h). */
const LINK = {
  id: "link-1",
  token: "tok-da-forma",
  expires_at: "2026-11-27T03:00:00+00:00",
  created_at: "2026-11-23T15:00:00Z",
};

const ENVIADA: FormaDoNegocio = { ...DO_CRITERIO, status: "enviada", linkAberto: LINK };

const texto = () => (document.body.textContent ?? "").replaceAll("\u00a0", " ");

function desenhar(props: Partial<Parameters<typeof CartaoDaFormaDePagamento>[0]> = {}) {
  return render(
    <CartaoDaFormaDePagamento
      negocioId="n1"
      pessoaId="p1"
      nomeDaPessoa="Maria Souza"
      itens={ITENS}
      forma={DO_CRITERIO}
      aberto
      podeConfirmar
      origem="https://hub.example"
      ddi="+55"
      telefone="98999990000"
      jaMandouFicha={false}
      fichaComumAbertaEm={null}
      agora={AGORA}
      {...props}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("CartaoDaFormaDePagamento", () => {
  it("sem forma e negócio aberto: Definir forma de pagamento", () => {
    desenhar({ forma: null });

    expect(screen.getByRole("button", { name: "Definir forma de pagamento" })).toBeTruthy();
  });

  it("sem forma e negócio encerrado: sem botão", () => {
    desenhar({ forma: null, aberto: false });

    expect(screen.getByText("Sem forma de pagamento.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Definir forma de pagamento" })).toBeNull();
  });

  it("mostra uma linha por parte, o total, e o dia da parcela sem voltar um dia", () => {
    desenhar();

    expect(
      screen.getByText(`Entrada · Pix · ${formatarMoeda(10000, "BRL")} · 10/11/2026`),
    ).toBeTruthy();
    expect(
      screen.getByText(
        `Parcelas · Transferência · 3 × ${formatarMoeda(3000, "USD")} · ` +
          "10/12/2026, 10/01/2027, 10/02/2027",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(`Total: ${formatarMoeda(10000, "BRL")} + ${formatarMoeda(9000, "USD")}`),
    ).toBeTruthy();
    expect(screen.getByText("rascunho")).toBeTruthy();
  });

  it("Confirmar pela equipe: só em rascunho e só para o dono ou a gestão", () => {
    const { unmount } = desenhar({ podeConfirmar: false });
    expect(screen.queryByRole("button", { name: "Confirmar pela equipe" })).toBeNull();
    expect(screen.getByRole("button", { name: "Editar" })).toBeTruthy();
    unmount();

    desenhar();
    expect(screen.getByRole("button", { name: "Confirmar pela equipe" })).toBeTruthy();
  });

  it("confirmada: selo, quem confirmou, e Refazer só para o dono ou a gestão", () => {
    const { unmount } = desenhar({ forma: CONFIRMADA, podeConfirmar: false });
    expect(screen.getByText("confirmada")).toBeTruthy();
    expect(screen.getByText(/Confirmada pela equipe em 05\/11\/2026, por Ana Lima/)).toBeTruthy();
    expect(screen.getByText(/"acertado por WhatsApp"/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Refazer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirmar pela equipe" })).toBeNull();
    unmount();

    desenhar({ forma: CONFIRMADA });
    fireEvent.click(screen.getByRole("button", { name: "Refazer" }));
    expect(
      screen.getByText(
        "A forma volta para rascunho. A confirmação de 05/11/2026 continua registrada.",
      ),
    ).toBeTruthy();
  });

  it("em rascunho depois de Refazer, a confirmação antiga não aparece", () => {
    desenhar({ forma: { ...CONFIRMADA, status: "rascunho" } });

    expect(screen.queryByText(/Confirmada pela equipe/)).toBeNull();
  });

  it("com as cobranças criadas: o link para o Financeiro do cliente, sem Refazer", () => {
    desenhar({ forma: { ...CONFIRMADA, charges_created_at: "2026-11-21T18:00:00Z" } });

    const link = screen.getByRole("link", { name: /Cobranças criadas no Ganho em 21\/11\/2026/ });
    expect(link.getAttribute("href")).toBe("/clientes/p1?aba=financeiro");
    expect(screen.queryByRole("button", { name: "Refazer" })).toBeNull();
  });

  it("negócio encerrado: sem Editar, e a cotação continua editável e opcional", async () => {
    desenhar({ aberto: false, forma: { ...DO_CRITERIO, reference_rate: 5.425 } });

    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirmar pela equipe" })).toBeNull();
    expect(screen.getByLabelText("Anotação da cotação")).toBeTruthy();

    // Opcional: apagar e sair do campo grava o vazio, em vez de voltar ao valor antigo.
    const cotacao = screen.getByLabelText("Cotação usada (C6)") as HTMLInputElement;
    expect(cotacao.value).toBe("5,425");
    fireEvent.change(cotacao, { target: { value: "" } });
    fireEvent.blur(cotacao);

    await vi.waitFor(() => expect(salvarCotacao).toHaveBeenCalledTimes(1));
    const formData = vi.mocked(salvarCotacao).mock.calls[0]![0] as FormData;
    expect(formData.get("reference_rate")).toBe("");
    expect(formData.get("plano")).toBe("plano-1");
    expect(formData.get("negocio")).toBe("n1");
  });

  it("a confirmação avisa quando a forma não soma o mesmo que os vistos", () => {
    const treze: FormaDoNegocio = {
      ...DO_CRITERIO,
      partes: [
        {
          label: "À vista",
          method: "pix",
          currency: "USD",
          total: 13000,
          installments_count: 1,
          usd_equivalent: null,
          parcelas: [{ number: 1, amount: 13000, due_on: "2026-12-10" }],
        },
      ],
    };
    desenhar({ forma: treze });

    fireEvent.click(screen.getByRole("button", { name: "Confirmar pela equipe" }));

    expect(
      screen.getByText(
        `A forma soma ${formatarMoeda(13000, "USD")} e os vistos, ${formatarMoeda(14000, "USD")}.`,
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText("Observação (opcional)")).toBeTruthy();
  });

  describe("entrega 4b: o cartão por estado", () => {
    it("rascunho: Editar, Enviar ficha e Confirmar pela equipe", () => {
      desenhar({ podeConfirmar: false });
      expect(screen.getByRole("button", { name: /Editar/ })).toBeTruthy();
      // Enviar não fecha acordo: qualquer membro (decisão 8).
      expect(screen.getByRole("button", { name: "Enviar ficha" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Confirmar pela equipe" })).toBeNull();
    });

    it("enviada: o selo diz até quando vale, e o WhatsApp leva o link e o prazo", () => {
      desenhar({ forma: ENVIADA });

      expect(screen.getByText("enviada · vale até qui, 26/11")).toBeTruthy();
      expect(screen.getByRole("button", { name: /Copiar link/ })).toBeTruthy();
      const whatsapp = screen.getByRole("link", { name: /WhatsApp/ });
      const href = whatsapp.getAttribute("href") ?? "";
      expect(href).toContain("https://wa.me/5598999990000?text=");
      expect(href).toContain(encodeURIComponent("https://hub.example/cadastro/tok-da-forma"));
      expect(href).toContain(encodeURIComponent("quinta-feira, 26/11"));

      expect(screen.getByRole("button", { name: /Editar/ })).toBeTruthy();
      expect(screen.getByRole("button", { name: /Cancelar link/ })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Confirmar pela equipe" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Enviar ficha" })).toBeNull();
    });

    it("enviada, Editar pergunta antes: o link enviado deixa de valer", () => {
      desenhar({ forma: ENVIADA });
      fireEvent.click(screen.getByRole("button", { name: /Editar/ }));
      expect(texto()).toContain("O link enviado em 23/11/2026 deixa de valer.");
    });

    it("sem telefone, o WhatsApp não aparece — só o copiar", () => {
      desenhar({ forma: ENVIADA, telefone: null });
      expect(screen.queryByRole("link", { name: /WhatsApp/ })).toBeNull();
      expect(screen.getByRole("button", { name: /Copiar link/ })).toBeTruthy();
    });

    it("link vencido: o selo diz, e o caminho é Editar", () => {
      desenhar({ forma: ENVIADA, agora: new Date("2026-11-27T03:01:00Z") });

      expect(screen.getByText("link vencido")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Copiar link/ })).toBeNull();
      expect(screen.getByRole("button", { name: /Editar/ })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Confirmar pela equipe" })).toBeTruthy();
    });

    it("recusada: o motivo, e Ajustar", () => {
      desenhar({
        forma: {
          ...DO_CRITERIO,
          status: "recusada",
          ultimaResposta: {
            answered_at: "2026-11-24T13:00:00Z",
            answered_by_name: "Maria Souza",
            reason: "Datas erradas",
            decision: "recusada",
          },
        },
      });

      expect(screen.getByText("recusada")).toBeTruthy();
      expect(screen.getByText("Motivo: Datas erradas")).toBeTruthy();
      expect(screen.getByRole("button", { name: /Ajustar/ })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull();
    });

    it("recusada sem motivo: diz que não houve", () => {
      desenhar({
        forma: {
          ...DO_CRITERIO,
          status: "recusada",
          ultimaResposta: { answered_at: "2026-11-24T13:00:00Z", answered_by_name: "Maria", reason: null, decision: "recusada" },
        },
      });
      expect(screen.getByText("Sem motivo informado.")).toBeTruthy();
    });

    it("rascunho depois de Ajustar: a recusa continua à vista, com o motivo", () => {
      desenhar({
        forma: {
          ...DO_CRITERIO,
          ultimaResposta: {
            answered_at: "2026-11-24T13:00:00Z",
            answered_by_name: "Maria Souza",
            reason: "Datas erradas",
            decision: "recusada",
          },
        },
      });
      expect(texto()).toContain("Recusada pelo cliente em 24/11/2026: Datas erradas");
      expect(screen.getByRole("button", { name: "Enviar ficha" })).toBeTruthy();
    });

    it("confirmada pelo cliente: diz que foi o cliente", () => {
      desenhar({
        forma: {
          ...DO_CRITERIO,
          status: "confirmada",
          ultimaResposta: { answered_at: "2026-11-24T13:00:00Z", answered_by_name: "Maria", reason: null, decision: "confirmada" },
        },
      });
      expect(texto()).toContain("Confirmada pelo cliente em 24/11/2026");
      expect(texto()).not.toContain("Confirmada pela equipe");
    });

    it("a parte em reais diz de quantos dólares veio (FIC-13)", () => {
      desenhar({
        forma: {
          ...DO_CRITERIO,
          partes: [
            {
              label: "Cartão",
              method: "cartao",
              currency: "BRL",
              total: 21527.76,
              installments_count: 1,
              usd_equivalent: 3900,
              parcelas: [{ number: 1, amount: 21527.76, due_on: "2026-12-15" }],
            },
          ],
        },
      });
      expect(texto()).toContain("US$ 3.900 convertidos para R$ 21.527,76");
    });
  });
});
