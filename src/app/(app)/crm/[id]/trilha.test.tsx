import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Trilha } from "./trilha";

vi.mock("@/features/opportunities/actions", () => ({ moveOpportunity: vi.fn() }));

/**
 * A trilha do topo da tela do lead: onde o negócio está, e um clique para
 * levá-lo a outra etapa. As regras de quem é "feita" ou "futura" têm teste
 * próprio (`features/opportunities/regras.test.ts`).
 */

const degraus = [
  { id: "e1", name: "Novo Lead", estado: "feita" as const },
  { id: "e2", name: "Reunião", estado: "atual" as const },
  { id: "e3", name: "Proposta", estado: "futura" as const },
];

describe("Trilha", () => {
  it("marca a etapa atual, e as outras são botões para mover", () => {
    render(<Trilha negocioId="n1" degraus={degraus} />);

    const atual = screen.getByText("Reunião").closest("[aria-current]");
    expect(atual?.getAttribute("aria-current")).toBe("step");

    expect(screen.getByRole("button", { name: "Mover para Novo Lead" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mover para Proposta" })).toBeTruthy();
    // Na etapa em que já está não há para onde mover.
    expect(screen.queryByRole("button", { name: "Mover para Reunião" })).toBeNull();
  });

  it("travada, mostra o caminho e não deixa mover — negócio ganho não anda", () => {
    render(<Trilha negocioId="n1" degraus={degraus} travada />);

    expect(screen.getByText("Proposta")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("funil sem etapa no meio diz onde criar", () => {
    render(<Trilha negocioId="n1" degraus={[]} />);

    expect(screen.getByText(/Etapas do funil/)).toBeTruthy();
  });
});
