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

const { EditarNegocio, ReabrirGanho } = await import("./acoes-do-negocio");

describe("ReabrirGanho", () => {
  it("abre o diálogo de reabrir, com a etapa para onde o negócio volta", () => {
    render(<ReabrirGanho negocio={{ id: "n1", cliente: "Ana de Teste" }} destino="Novo Lead" />);

    fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));

    expect(screen.getByText("Reabrir este negócio?")).toBeTruthy();
    expect(screen.getByText("Ele volta para Novo Lead.")).toBeTruthy();
  });
});

describe("EditarNegocio: dono e participantes do negócio", () => {
  const EQUIPE = [
    { id: "u1", nome: "Renato" },
    { id: "u2", nome: "Ana" },
    { id: "u3", nome: "Bruno" },
  ];
  const NEGOCIO = { id: "n1", title: "EB-1A", source: null, owner_id: "u2" };

  it("abre com o dono e os participantes atuais, escolhidos na equipe", () => {
    render(<EditarNegocio negocio={NEGOCIO} equipe={EQUIPE} participantes={["u3"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));

    const dono = screen.getByLabelText("Dono") as HTMLSelectElement;
    expect(dono.value).toBe("u2");
    expect([...dono.options].map((o) => o.text)).toEqual(["Sem dono", "Renato", "Ana", "Bruno"]);
    expect((screen.getByRole("checkbox", { name: "Bruno" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Renato" }) as HTMLInputElement).checked).toBe(false);
  });

  it("dono fora da equipe visível continua escolhido, em vez de virar 'Sem dono'", () => {
    render(
      <EditarNegocio
        negocio={{ ...NEGOCIO, owner_id: "u9" }}
        equipe={EQUIPE}
        participantes={[]}
        nomeDoDono="Fulana"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));

    const dono = screen.getByLabelText("Dono") as HTMLSelectElement;
    expect(dono.value).toBe("u9");
    expect([...dono.options].map((o) => o.text)).toContain("Fulana");
  });
});
