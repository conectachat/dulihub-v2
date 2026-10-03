import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { progressoDasEtapas } from "@/features/projects/campos";

import { BarraDeProgresso, ProgressoDoProjeto } from "./partes";

/**
 * A barra de evolução, desenhada.
 *
 * Em 3/out ela mostrava "0/16" num processo com 11 etapas concluídas: contava
 * pastas, e nada na tela dizia isso. A regra tem teste próprio
 * (`features/projects/campos.test.ts`); aqui se prova o que a pessoa lê — o
 * percentual, a contagem, e de quê.
 */

const etapas = (concluidas: number, total: number) =>
  progressoDasEtapas(
    Array.from({ length: total }, (_, i) => ({ concluida: i < concluidas })),
  );

describe("BarraDeProgresso", () => {
  it("mostra o percentual e a contagem de etapas", () => {
    render(<BarraDeProgresso progresso={etapas(11, 26)} />);

    expect(screen.getByText("42%")).toBeTruthy();
    expect(screen.getByText("11/26")).toBeTruthy();

    const barra = screen.getByRole("progressbar", { name: "Etapas concluídas" });
    expect(barra.getAttribute("aria-valuenow")).toBe("42");
  });

  it("sem etapa, diz isso — e não desenha uma barra em 0%", () => {
    render(<BarraDeProgresso progresso={etapas(0, 0)} />);

    expect(screen.getByText("Sem etapas")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

describe("ProgressoDoProjeto", () => {
  it("no cabeçalho do processo, diz por extenso o que a barra conta", () => {
    render(<ProgressoDoProjeto progresso={etapas(11, 26)} />);

    expect(screen.getByText("Progresso do projeto")).toBeTruthy();
    expect(screen.getByText("42%")).toBeTruthy();
    expect(screen.getByText("11 de 26 etapas concluídas")).toBeTruthy();
  });

  it("uma etapa só é escrita no singular", () => {
    render(<ProgressoDoProjeto progresso={etapas(1, 1)} />);

    expect(screen.getByText("1 de 1 etapa concluída")).toBeTruthy();
  });

  it("sem etapa, explica em vez de mostrar 0%", () => {
    render(<ProgressoDoProjeto progresso={etapas(0, 0)} />);

    expect(screen.getByText("Progresso do projeto")).toBeTruthy();
    expect(screen.getByText("Sem etapas")).toBeTruthy();
    expect(screen.queryByText("0%")).toBeNull();
  });
});
