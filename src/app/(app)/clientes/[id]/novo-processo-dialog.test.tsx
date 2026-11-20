import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NovoProcessoDialog } from "./novo-processo-dialog";

/**
 * O "+ Novo processo" abre sozinho de dois jeitos: pelo atalho do CRM, com o
 * negócio escolhido, e depois do Novo cliente (CLI-15), sem negócio.
 */

vi.mock("@/features/projects/actions", () => ({ criarProcesso: vi.fn() }));

const VISTOS = [{ id: "v1", name: "EB-1A" }];
const NEGOCIOS = [{ id: "n1", title: "EB-1A da Maria" }];

describe("NovoProcessoDialog", () => {
  it("fechado quando ninguém pede para abrir", () => {
    render(
      <NovoProcessoDialog personId="p1" personName="Maria" vistos={VISTOS} negocios={NEGOCIOS} abertoDeInicio={false} />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("aberto e sem negócio depois do Novo cliente", () => {
    render(
      <NovoProcessoDialog personId="p1" personName="Maria" vistos={VISTOS} negocios={NEGOCIOS} abertoDeInicio />,
    );
    expect(screen.getByRole("dialog", { name: "Novo processo" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Negócio/)).toHaveValue("");
  });

  it("aberto e com o negócio do atalho do CRM", () => {
    render(
      <NovoProcessoDialog
        personId="p1"
        personName="Maria"
        vistos={VISTOS}
        negocios={NEGOCIOS}
        negocioInicial="n1"
        abertoDeInicio
      />,
    );
    expect(screen.getByLabelText(/Negócio/)).toHaveValue("n1");
  });
});
