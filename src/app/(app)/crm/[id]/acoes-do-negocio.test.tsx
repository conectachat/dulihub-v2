import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * O negócio ganho, na tela do lead, também reabre (CRM-15) — pelo mesmo
 * diálogo do quadro, que diz para onde ele volta e pede a confirmação.
 */

vi.mock("@/features/opportunities/actions", () => ({
  ganharOportunidade: vi.fn(),
  perderOportunidade: vi.fn(),
  resumoDoGanho: vi.fn(),
  reabrirOportunidade: vi.fn(),
  moveOpportunity: vi.fn(),
  updateOpportunity: vi.fn(),
}));

const { ReabrirGanho } = await import("./acoes-do-negocio");

describe("ReabrirGanho", () => {
  it("abre o diálogo de reabrir, com a etapa para onde o negócio volta", () => {
    render(<ReabrirGanho negocio={{ id: "n1", cliente: "Ana de Teste" }} destino="Novo Lead" />);

    fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));

    expect(screen.getByText("Reabrir este negócio?")).toBeTruthy();
    expect(screen.getByText("Ele volta para Novo Lead.")).toBeTruthy();
  });
});
