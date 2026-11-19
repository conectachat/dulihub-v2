import { afterEach, describe, expect, it, vi } from "vitest";

import { abrirEmNovaAba, baixar } from "./abrir";

/**
 * Abrir um arquivo cuja URL assinada só existe depois de uma ida ao servidor.
 *
 * O Safari (sobretudo no iPhone) bloqueia `window.open` chamado depois de um
 * `await`: a janela tem de abrir no clique, e só depois receber o endereço.
 */

afterEach(() => vi.restoreAllMocks());

describe("abrirEmNovaAba", () => {
  it("abre a janela antes de pedir a URL, e depois a leva até ela", async () => {
    const janela = { opener: {} as unknown, location: { href: "" }, close: vi.fn() };
    const ordem: string[] = [];
    vi.spyOn(window, "open").mockImplementation(() => {
      ordem.push("abriu");
      return janela as unknown as Window;
    });

    const ok = await abrirEmNovaAba(async () => {
      ordem.push("pediu");
      return "https://assinada/x.pdf";
    });

    expect(ok).toBe(true);
    expect(ordem).toEqual(["abriu", "pediu"]);
    expect(janela.location.href).toBe("https://assinada/x.pdf");
    expect(janela.opener).toBeNull();
  });

  it("sem URL, fecha a janela vazia e avisa quem chamou", async () => {
    const janela = { opener: null, location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockImplementation(() => janela as unknown as Window);

    const ok = await abrirEmNovaAba(async () => null);

    expect(ok).toBe(false);
    expect(janela.close).toHaveBeenCalled();
  });
});

describe("abrirEmNovaAba quando o pedido falha", () => {
  it("endereço que lança (rede caiu) fecha a aba vazia e devolve falso, sem lançar", async () => {
    const janela = { opener: null, location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockImplementation(() => janela as unknown as Window);

    const ok = await abrirEmNovaAba(async () => {
      throw new Error("Failed to fetch");
    });

    expect(ok).toBe(false);
    expect(janela.close).toHaveBeenCalled();
  });
});

describe("baixar", () => {
  it("endereço que lança devolve falso, sem lançar", async () => {
    const ok = await baixar(async () => {
      throw new Error("Failed to fetch");
    });

    expect(ok).toBe(false);
  });

  it("baixa na própria aba: a URL de download não troca de página", async () => {
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ assign } as unknown as Location);

    const ok = await baixar(async () => "https://assinada/x.pdf?download=x.pdf");

    expect(ok).toBe(true);
    expect(assign).toHaveBeenCalledWith("https://assinada/x.pdf?download=x.pdf");
  });
});
