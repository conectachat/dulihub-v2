import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ParcelaNaLista } from "@/features/financeiro/consultas-locais";
import { hojeEmSaoPaulo } from "@/lib/formatar";

/**
 * A tela Financeiro com pagamento em dólar sem cotação (24/nov): é o caminho
 * certo quando o dinheiro fica em dólar e é convertido depois — a tela não
 * pode tratá-lo como erro.
 */

let parcelas: ParcelaNaLista[] = [];

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("dexie-react-hooks", () => ({ useLiveQuery: () => parcelas }));
vi.mock("@/lib/local/usuario", () => ({
  useUsuarioLocal: () => ({ userId: "u1", email: null, carregado: true }),
}));
vi.mock("@/lib/local/estado", () => ({
  useSincronia: () => ({ em: "2026-11-24T10:00:00Z", online: true, sincronizando: false, error: null }),
}));
vi.mock("@/lib/local/sincronizador", () => ({ bancoDoUsuario: () => ({}), filaDoUsuario: () => ({}) }));
vi.mock("@/features/financeiro/consultas-locais", () => ({ parcelasDoAparelho: vi.fn() }));

const { ListaDoFinanceiro } = await import("./lista");

describe("ListaDoFinanceiro", () => {
  it("pagamento em dólar sem cotação aparece à parte, sem alerta de erro", () => {
    const hoje = hojeEmSaoPaulo();
    parcelas = [
      {
        id: "p1",
        receivable_id: "c1",
        number: 1,
        amount: 1500,
        due_on: hoje,
        paid_on: hoje,
        paid_rate: null,
        method: "pix",
        notes: null,
        pendente: false,
        conflito: null,
        cobranca: "Montagem do processo",
        currency: "USD",
        cliente: "Fulano de Tal",
        person_id: "pessoa",
        via: "Thais Fabrini",
      },
    ];

    render(<ListaDoFinanceiro />);

    expect(screen.getByText("1 em dólar sem cotação, fora da soma")).toBeTruthy();
    expect(screen.queryByText(/sem a cotação do dia/)).toBeNull();
  });
});
