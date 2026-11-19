import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TabsContent } from "@/components/ui/tabs";

/**
 * Abas com a aberta guardada na URL (`?aba=`), para link e recarregar
 * levarem à mesma aba (CLI-2). Trocar de aba não refaz a página no servidor
 * nem rola a tela: é `history.replaceState`, que o Next integra ao
 * `useSearchParams`.
 */

let atuais = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(atuais),
}));

const { AbasNaUrl } = await import("./abas-na-url");

const ABAS = [
  { valor: "dados", rotulo: "Dados" },
  { valor: "projetos", rotulo: "Projetos" },
  { valor: "notas", rotulo: "Notas" },
];

function desenhar() {
  return render(
    <AbasNaUrl abas={ABAS} padrao="dados">
      <TabsContent value="dados">conteúdo dados</TabsContent>
      <TabsContent value="projetos">conteúdo projetos</TabsContent>
      <TabsContent value="notas">conteúdo notas</TabsContent>
    </AbasNaUrl>,
  );
}

const selecionada = () =>
  screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true")?.textContent;

beforeEach(() => {
  atuais = "";
  window.history.replaceState(null, "", "/clientes/1");
});

describe("AbasNaUrl", () => {
  it("abre a aba da URL", () => {
    atuais = "aba=notas";
    desenhar();

    expect(selecionada()).toBe("Notas");
    expect(screen.getByText("conteúdo notas")).toBeTruthy();
  });

  it("aba desconhecida, ou nenhuma, abre a padrão — e #dados-cadastrais cai nela", () => {
    atuais = "aba=xyz";
    window.history.replaceState(null, "", "/clientes/1#dados-cadastrais");
    desenhar();

    expect(selecionada()).toBe("Dados");
  });

  it("trocar de aba grava ?aba= sem rolar a página e mantém o resto da query", () => {
    atuais = "x=1";
    window.history.replaceState(null, "", "/clientes/1?x=1");
    const trocar = vi.spyOn(window.history, "replaceState");
    const rolar = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    desenhar();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Projetos" }));

    expect(trocar).toHaveBeenCalledWith(null, "", "?x=1&aba=projetos");
    expect(selecionada()).toBe("Projetos");
    expect(rolar).not.toHaveBeenCalled();
  });
});
