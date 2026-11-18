import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { formatarData } from "@/lib/formatar";

import { AvisoDeOportunidade } from "./aviso-de-oportunidade";

/**
 * O contato escolhido já tem oportunidade (CRM-11): mostrar qual, em que
 * situação e de quando, antes de criar outra — um cliente pode ter fechado um
 * visto e agora pedir outro, mas também pode ser o mesmo negócio em dobro.
 */

describe("AvisoDeOportunidade", () => {
  it("mostra título com link, situação e data", () => {
    const aoCriarOutra = vi.fn();
    render(
      <AvisoDeOportunidade
        oportunidades={[
          { id: "n1", titulo: "EB-2 NIW", status: "won", criadaEm: "2026-10-01T12:00:00+00:00" },
          { id: "n2", titulo: "O-1", status: "open", criadaEm: "2026-11-10T12:00:00+00:00" },
        ]}
        aoCriarOutra={aoCriarOutra}
      />,
    );

    const link = screen.getByRole("link", { name: "EB-2 NIW" });
    expect(link).toHaveAttribute("href", "/crm/n1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText(/ganha/)).toBeInTheDocument();
    expect(screen.getByText(/aberta/)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(formatarData("2026-10-01T12:00:00+00:00"))),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Criar outra" }));
    expect(aoCriarOutra).toHaveBeenCalledTimes(1);
  });
});
