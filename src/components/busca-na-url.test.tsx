import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A busca que mora na URL (`?q=`), usada por Contatos e Clientes.
 *
 * Buscar de novo volta para a primeira página: na página 3 de uma lista,
 * a busca nova pode ter uma página só, e a tela diria "nenhum resultado".
 */

const push = vi.fn();
let atuais = "pagina=3&view=excluidos";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/clientes",
  useSearchParams: () => new URLSearchParams(atuais),
}));

const { BuscaNaUrl } = await import("./busca-na-url");

beforeEach(() => {
  vi.useFakeTimers();
  push.mockClear();
  atuais = "pagina=3&view=excluidos";
});
afterEach(() => vi.useRealTimers());

describe("BuscaNaUrl", () => {
  it("espera a digitação parar, grava ?q= na rota atual e volta para a primeira página", () => {
    render(<BuscaNaUrl placeholder="Buscar" rotulo="Buscar clientes" />);

    fireEvent.change(screen.getByLabelText("Buscar clientes"), { target: { value: "ana" } });
    expect(push).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(350));

    expect(push).toHaveBeenCalledWith("/clientes?view=excluidos&q=ana");
  });

  it("apagar a busca tira o ?q=", () => {
    atuais = "q=ana";
    render(<BuscaNaUrl placeholder="Buscar" rotulo="Buscar clientes" />);

    fireEvent.change(screen.getByLabelText("Buscar clientes"), { target: { value: "" } });
    act(() => vi.advanceTimersByTime(350));

    expect(push).toHaveBeenCalledWith("/clientes");
  });
});
