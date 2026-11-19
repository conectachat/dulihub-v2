import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Cobranca } from "@/features/financeiro/consultas-locais";
import { formatarMoeda } from "@/lib/totals";

/**
 * A aba Financeiro do cliente (CLI-5, D5).
 *
 * Com rede, ela espera uma sincronia antes de mostrar a lista: logo depois do
 * Ganho, as cobranças ainda não desceram, e "Nenhuma cobrança" levaria alguém
 * a criar de novo (I26). Mas não espera para sempre — passados 5 s, ou se a
 * sincronia falhar, mostra o que já está no aparelho. Sem rede, mostra direto.
 */

const sincronizarAgora = vi.fn<(userId: string) => Promise<void>>();
let cobrancas: Cobranca[] = [];

vi.mock("@/lib/local/usuario", () => ({
  useUsuarioLocal: () => ({ userId: "u1", email: null, carregado: true }),
}));
vi.mock("@/lib/local/sincronizador", () => ({
  sincronizarAgora: (id: string) => sincronizarAgora(id),
  bancoDoUsuario: () => ({}),
  filaDoUsuario: () => ({}),
}));
vi.mock("dexie-react-hooks", () => ({ useLiveQuery: () => cobrancas }));
vi.mock("@/features/financeiro/consultas-locais", () => ({ cobrancasDoContato: vi.fn() }));
vi.mock("@/features/financeiro/escritas-locais", () => ({
  criarCobranca: vi.fn(),
  darBaixa: vi.fn(),
  desfazerBaixa: vi.fn(),
  excluirCobranca: vi.fn(),
  renomearCobranca: vi.fn(),
}));

const { Cobrancas } = await import("./cobrancas");

function cobranca(
  id: string,
  currency: string,
  parcelas: [number, string, string | null][],
): Cobranca {
  const ps = parcelas.map(([amount, due_on, paid_on], i) => ({
    id: `${id}-${i}`,
    receivable_id: id,
    number: i + 1,
    amount,
    due_on,
    paid_on,
    paid_rate: paid_on && currency !== "BRL" ? 5 : null,
    method: "pix",
    notes: null,
  }));
  const total = parcelas.reduce((s, [a]) => s + a, 0);
  return {
    id,
    person_id: "p1",
    project_id: null,
    title: `Cobrança ${id}`,
    amount: total,
    list_amount: null,
    currency,
    notes: null,
    parcelas: ps,
    resumo: { total, pago: 0, aberto: total, vencido: 0, parcelas: ps.length, pagas: 0 },
  };
}

function online(valor: boolean) {
  Object.defineProperty(navigator, "onLine", { value: valor, configurable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
  sincronizarAgora.mockReset();
  cobrancas = [cobranca("a", "BRL", [[1000, "2000-01-10", null]])];
  online(true);
});
afterEach(() => vi.useRealTimers());

describe("aba Financeiro do cliente", () => {
  it("com rede, mostra sincronizando até a sincronia acabar, e só então a lista", async () => {
    let terminar = () => {};
    sincronizarAgora.mockReturnValue(new Promise<void>((r) => (terminar = r)));

    render(<Cobrancas personId="p1" />);
    await act(async () => {});

    expect(screen.getByText("Sincronizando…")).toBeTruthy();
    expect(screen.queryByText("1 cobrança")).toBeNull();
    expect(sincronizarAgora).toHaveBeenCalledWith("u1");

    await act(async () => terminar());

    expect(screen.queryByText("Sincronizando…")).toBeNull();
    expect(screen.getByText("1 cobrança")).toBeTruthy();
  });

  it("sincronia que não responde: em 5 s mostra o que está no aparelho", async () => {
    sincronizarAgora.mockReturnValue(new Promise<void>(() => {}));

    render(<Cobrancas personId="p1" />);
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(4999));
    expect(screen.getByText("Sincronizando…")).toBeTruthy();

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByText("1 cobrança")).toBeTruthy();
  });

  it("sincronia que falha: mostra o que está no aparelho", async () => {
    sincronizarAgora.mockRejectedValue(new Error("rede"));

    render(<Cobrancas personId="p1" />);
    await act(async () => {});

    expect(screen.getByText("1 cobrança")).toBeTruthy();
  });

  it("sem rede, mostra a lista direto, sem tentar sincronizar", async () => {
    online(false);

    render(<Cobrancas personId="p1" />);
    await act(async () => {});

    expect(screen.getByText("1 cobrança")).toBeTruthy();
    expect(sincronizarAgora).not.toHaveBeenCalled();
  });

  it("os totais vêm por moeda, real e dólar separados", async () => {
    online(false);
    cobrancas = [
      cobranca("a", "BRL", [
        [1000, "2000-01-10", null],
        [500, "2000-02-10", "2000-02-10"],
      ]),
      cobranca("b", "USD", [[12000, "2999-01-10", null]]),
    ];

    render(<Cobrancas personId="p1" />);
    await act(async () => {});

    const brl = screen.getByRole("group", { name: "Totais em BRL" });
    expect(brl.textContent).toContain(`Contratado${formatarMoeda(1500, "BRL")}`);
    expect(brl.textContent).toContain(`Pago${formatarMoeda(500, "BRL")}`);
    expect(brl.textContent).toContain(`Saldo devedor${formatarMoeda(1000, "BRL")}`);
    expect(brl.textContent).toContain(`Vencido${formatarMoeda(1000, "BRL")}`);

    const usd = screen.getByRole("group", { name: "Totais em USD" });
    expect(usd.textContent).toContain(`Contratado${formatarMoeda(12000, "USD")}`);
    expect(usd.textContent).toContain(`Vencido${formatarMoeda(0, "USD")}`);
  });
});
