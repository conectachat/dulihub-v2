import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hojeEmSaoPaulo } from "@/lib/formatar";
import { somarMeses } from "@/lib/parcelas";
import { formatarMoeda as moeda } from "@/lib/totals";

import { DialogoDeGanho, DialogoDePerda, DialogoDeReabrir } from "./dialogos";

/** O valor como a tela o lê: o espaço rígido de `Intl` vira espaço comum na comparação. */
const formatarMoeda = (valor: number, m: string) => moeda(valor, m).replace(/\s/g, " ");

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
  forma: {
    situacao: "sem_forma",
    confirmada_em: null,
    confirmada_por: null,
    ultima_decisao: null,
    enviada_em: null,
    cobrancas_criadas_em: null,
    partes: [],
  },
  cobrancas: [],
  avisos: [],
};

/** Daqui a um mês: nenhuma parcela vencida, seja qual for o dia em que o teste roda. */
const MES_QUE_VEM = somarMeses(hojeEmSaoPaulo(), 1);

function ontem(): string {
  const [ano, mes, dia] = hojeEmSaoPaulo().split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(ano, mes - 1, dia - 1)).toISOString().slice(0, 10);
}

const parte = (
  id: string,
  label: string,
  currency: "BRL" | "USD",
  total: number,
  parcelas: { number: number; amount: number; due_on: string }[],
) => ({
  id,
  label,
  method: currency === "BRL" ? ("pix" as const) : ("transferencia" as const),
  currency,
  total,
  installments_count: parcelas.length,
  parcelas,
});

/** Entrada em real e 2 transferências em dólar: 2 cobranças. */
const CONFIRMADA = {
  ...RESUMO,
  forma: {
    situacao: "confirmada",
    confirmada_em: "2026-11-05T15:00:00Z",
    confirmada_por: "Ana Lima",
    ultima_decisao: "confirmada_pela_equipe",
    enviada_em: null,
    cobrancas_criadas_em: null,
    partes: [
      parte("pt1", "Entrada", "BRL", 10000, [{ number: 1, amount: 10000, due_on: MES_QUE_VEM }]),
      parte("pt2", "Parcelas", "USD", 14000, [
        { number: 1, amount: 7000, due_on: MES_QUE_VEM },
        { number: 2, amount: 7000, due_on: somarMeses(MES_QUE_VEM, 1) },
      ]),
    ],
  },
  cobrancas: [
    { id: null, titulo: "Entrada — EB-1A, O-1", moeda: "BRL", total: 10000, parcelas: 1 },
    { id: null, titulo: "Parcelas — EB-1A, O-1", moeda: "USD", total: 14000, parcelas: 2 },
  ],
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
    expect(screen.getByText("Não definida: nenhuma cobrança será criada.")).toBeTruthy();
    expect(screen.getByText("Ana de Teste passa a ser cliente")).toBeTruthy();
    expect(
      screen.getByText("Serão criados 2 processos: EB-1A — Ana de Teste; O-1 — Ana de Teste"),
    ).toBeTruthy();
    // Os fixos de antes da entrega 4a saíram.
    expect(screen.queryByText("Forma de pagamento: definir na aba Financeiro")).toBeNull();
    expect(screen.queryByText("Nenhuma cobrança será criada.")).toBeNull();
  });

  it("forma confirmada: quem confirmou, as partes e as cobranças que vão nascer", async () => {
    acoes.resumoDoGanho.mockResolvedValue({ resumo: CONFIRMADA, error: null });
    render(<DialogoDeGanho negocio={negocio} aberto aoMudar={() => {}} />);

    expect(
      await screen.findByText("Confirmada pela equipe em 05/11/2026, por Ana Lima"),
    ).toBeTruthy();
    expect(screen.getByText(/^Entrada · Pix · /)).toBeTruthy();
    expect(screen.getByText(/^Parcelas · Transferência · 2 × /)).toBeTruthy();
    expect(
      screen.getByText(
        `Serão criadas 2 cobranças (${formatarMoeda(10000, "BRL")}; ${formatarMoeda(14000, "USD")})`,
      ),
    ).toBeTruthy();
    // Vistos de US$ 14.000 e partes em duas moedas: não há o que comparar.
    expect(screen.queryByText(/A forma soma/)).toBeNull();
    expect(screen.queryByText(/já vencida/)).toBeNull();
  });

  it("uma cobrança só: no singular", async () => {
    acoes.resumoDoGanho.mockResolvedValue({
      resumo: {
        ...CONFIRMADA,
        forma: { ...CONFIRMADA.forma, partes: [CONFIRMADA.forma.partes[0]!] },
        cobrancas: [CONFIRMADA.cobrancas[0]!],
      },
      error: null,
    });
    render(<DialogoDeGanho negocio={negocio} aberto aoMudar={() => {}} />);

    expect(
      await screen.findByText(`Será criada 1 cobrança (${formatarMoeda(10000, "BRL")})`),
    ).toBeTruthy();
  });

  it("forma em rascunho: nenhuma cobrança, e o porquê", async () => {
    acoes.resumoDoGanho.mockResolvedValue({
      resumo: {
        ...CONFIRMADA,
        forma: { ...CONFIRMADA.forma, situacao: "rascunho", confirmada_em: null, confirmada_por: null },
        cobrancas: [],
      },
      error: null,
    });
    render(<DialogoDeGanho negocio={negocio} aberto aoMudar={() => {}} />);

    expect(
      await screen.findByText(
        "Em rascunho: nenhuma cobrança será criada. Para criá-las, confirme a forma antes do Ganho.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/cobranças? \(/)).toBeNull();
    expect(screen.queryByText(/Confirmada pela equipe/)).toBeNull();
  });

  it("cobranças já criadas: a data, e o visto novo fora da forma", async () => {
    acoes.resumoDoGanho.mockResolvedValue({
      resumo: {
        ...RESUMO,
        itens: [...RESUMO.itens, { id: "i3", visa_name: "EB-2 NIW", amount: 5000, currency: "USD" }],
        processos: [{ item: "i3", titulo: "EB-2 NIW — Ana de Teste", id: null }],
        forma: {
          ...CONFIRMADA.forma,
          situacao: "cobrancas_criadas",
          cobrancas_criadas_em: "2026-11-21T18:00:00Z",
        },
        cobrancas: [],
      },
      error: null,
    });
    render(<DialogoDeGanho negocio={negocio} aberto aoMudar={() => {}} />);

    expect(
      await screen.findByText("As cobranças desta forma já foram criadas em 21/11/2026."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "EB-2 NIW não está na forma de pagamento: crie a cobrança à mão na aba Financeiro.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/cobranças? \(/)).toBeNull();
  });

  it("parcela de ontem que vai nascer: 1 parcela já vencida, em Ao confirmar", async () => {
    acoes.resumoDoGanho.mockResolvedValue({
      resumo: {
        ...CONFIRMADA,
        forma: {
          ...CONFIRMADA.forma,
          partes: [parte("pt1", "Entrada", "BRL", 10000, [{ number: 1, amount: 10000, due_on: ontem() }])],
        },
        cobrancas: [CONFIRMADA.cobrancas[0]!],
      },
      error: null,
    });
    render(<DialogoDeGanho negocio={negocio} aberto aoMudar={() => {}} />);

    const aoConfirmar = await screen.findByRole("list", { name: "Ao confirmar" });
    expect(within(aoConfirmar).getByText("1 parcela já vencida")).toBeTruthy();
  });

  it("forma de US$ 13.000 para vistos de US$ 14.000: o aviso de coerência", async () => {
    acoes.resumoDoGanho.mockResolvedValue({
      resumo: {
        ...CONFIRMADA,
        forma: {
          ...CONFIRMADA.forma,
          partes: [parte("pt1", "À vista", "USD", 13000, [{ number: 1, amount: 13000, due_on: MES_QUE_VEM }])],
        },
        cobrancas: [{ id: null, titulo: "À vista — EB-1A, O-1", moeda: "USD", total: 13000, parcelas: 1 }],
      },
      error: null,
    });
    render(<DialogoDeGanho negocio={negocio} aberto aoMudar={() => {}} />);

    expect(
      await screen.findByText(
        `A forma soma ${formatarMoeda(13000, "USD")} e os vistos, ${formatarMoeda(14000, "USD")}.`,
      ),
    ).toBeTruthy();
  });

  it("o dia da parcela não volta um dia: 2026-12-10 é 10/12/2026", async () => {
    acoes.resumoDoGanho.mockResolvedValue({
      resumo: {
        ...CONFIRMADA,
        forma: {
          ...CONFIRMADA.forma,
          partes: [parte("pt1", "Entrada", "BRL", 10000, [{ number: 1, amount: 10000, due_on: "2026-12-10" }])],
        },
        cobrancas: [CONFIRMADA.cobrancas[0]!],
      },
      error: null,
    });
    render(<DialogoDeGanho negocio={negocio} aberto aoMudar={() => {}} />);

    expect(await screen.findByText(/^Entrada · Pix · .* · 10\/12\/2026$/)).toBeTruthy();
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

describe("Cancelar limpa o diálogo", () => {
  it("o Ganho reaberto pede o resumo de novo, sem mostrar o de antes", async () => {
    const aoMudar = vi.fn();
    const { rerender } = render(<DialogoDeGanho negocio={negocio} aberto aoMudar={aoMudar} />);
    expect(await screen.findByText("EB-1A")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoMudar).toHaveBeenCalledWith(false);
    rerender(<DialogoDeGanho negocio={negocio} aberto={false} aoMudar={aoMudar} />);

    // O resumo novo demora: até chegar, nada de resumo velho nem de Confirmar.
    acoes.resumoDoGanho.mockReturnValue(new Promise(() => {}));
    rerender(<DialogoDeGanho negocio={negocio} aberto aoMudar={aoMudar} />);
    expect(screen.getByText("Montando o resumo...")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirmar Ganho" })).toBeNull();
  });

  it("o Reabrir reaberto não mostra a recusa de antes", async () => {
    acoes.reabrirOportunidade.mockResolvedValueOnce({
      error: "Só o dono do negócio ou a gestão reabrem o negócio.",
    });
    const aoMudar = vi.fn();
    const { rerender } = render(
      <DialogoDeReabrir negocio={negocio} destino="Novo Lead" aberto aoMudar={aoMudar} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));
    expect(await screen.findByText("Só o dono do negócio ou a gestão reabrem o negócio.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    rerender(<DialogoDeReabrir negocio={negocio} destino="Novo Lead" aberto={false} aoMudar={aoMudar} />);
    rerender(<DialogoDeReabrir negocio={negocio} destino="Novo Lead" aberto aoMudar={aoMudar} />);
    expect(screen.queryByText("Só o dono do negócio ou a gestão reabrem o negócio.")).toBeNull();
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

  describe("entrega 4b: a forma enviada e a recusada (CRM-14)", () => {
    const texto = () => (document.body.textContent ?? "").replaceAll("\u00a0", " ");

    it("enviada sem resposta: nenhuma cobrança, e o link será cancelado", async () => {
      acoes.resumoDoGanho.mockResolvedValue({ error: null, resumo: {
        ...RESUMO,
        forma: { ...RESUMO.forma, situacao: "enviada", enviada_em: "2026-11-23T15:00:00Z" },
      } });
      render(<DialogoDeGanho negocio={negocio} aberto aoMudar={() => {}} />);
      await screen.findByText("EB-1A");
      expect(texto()).toContain(
        "Enviada ao cliente em 23/11/2026, sem resposta: nenhuma cobrança será criada, e o link será cancelado. Para criá-las, confirme pela equipe antes do Ganho.",
      );
    });

    it("recusada: nenhuma cobrança, e o caminho é ajustar ou confirmar pela equipe", async () => {
      acoes.resumoDoGanho.mockResolvedValue({ error: null, resumo: {
        ...RESUMO,
        forma: {
          ...RESUMO.forma,
          situacao: "recusada",
          ultima_decisao: "recusada",
          confirmada_em: "2026-11-24T13:00:00Z",
          confirmada_por: "Ana de Teste",
        },
      } });
      render(<DialogoDeGanho negocio={negocio} aberto aoMudar={() => {}} />);
      await screen.findByText("EB-1A");
      expect(texto()).toContain(
        "Recusada pelo cliente em 24/11/2026: nenhuma cobrança será criada. Ajuste a forma e envie de novo, ou confirme pela equipe.",
      );
    });

    it("confirmada pelo cliente: diz que foi o cliente, e a parte convertida aparece assim", async () => {
      acoes.resumoDoGanho.mockResolvedValue({ error: null, resumo: {
        ...CONFIRMADA,
        forma: {
          ...CONFIRMADA.forma,
          ultima_decisao: "confirmada",
          partes: [
            {
              ...parte("pt3", "Cartão", "BRL", 21527.76, [{ number: 1, amount: 21527.76, due_on: MES_QUE_VEM }]),
              method: "cartao",
              usd_equivalent: 3900,
            },
          ],
        },
      } });
      render(<DialogoDeGanho negocio={negocio} aberto aoMudar={() => {}} />);
      await screen.findByText("EB-1A");
      expect(texto()).toContain("Confirmada pelo cliente em 05/11/2026");
      expect(texto()).not.toContain("Confirmada pela equipe");
      expect(texto()).toContain("US$ 3.900 convertidos para R$ 21.527,76");
    });
  });
});
