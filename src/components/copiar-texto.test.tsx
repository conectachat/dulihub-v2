import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CopiarTexto } from "./copiar-texto";

/**
 * Copiar telefone, e-mail ou link com um clique (CLI-2): o texto vai para a
 * área de transferência e o botão diz "Copiado" por um instante.
 */

const escrever = vi.fn(async () => {});

beforeEach(() => {
  vi.useFakeTimers();
  escrever.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: escrever },
    configurable: true,
  });
});
afterEach(() => vi.useRealTimers());

describe("CopiarTexto", () => {
  it("põe o texto na área de transferência e mostra Copiado", async () => {
    render(<CopiarTexto texto="+55 31 99999-0000" rotulo="telefone" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copiar telefone" }));
    });

    expect(escrever).toHaveBeenCalledWith("+55 31 99999-0000");
    expect(screen.getByText("Copiado")).toBeTruthy();

    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByText("Copiado")).toBeNull();
  });

  it("com texto no botão, ele vira Copiado", async () => {
    render(
      <CopiarTexto texto="https://x" rotulo="link">
        Copiar
      </CopiarTexto>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Copiar/ }));
    });

    expect(screen.getByRole("button", { name: /Copiado/ })).toBeTruthy();
  });
});
