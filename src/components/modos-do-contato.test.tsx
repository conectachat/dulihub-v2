import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ModosDoContato, type ModoDoContato } from "./modos-do-contato";

/**
 * O terceiro modo, "Parceiro", só existe no Novo cliente (PAR-5): a Nova
 * oportunidade continua com dois — cliente de parceiro não entra no funil.
 */

vi.mock("@/components/form-dialog", () => ({ useDispensarAviso: () => () => {} }));

function Modos({ comParceiro }: { comParceiro?: boolean }) {
  const [modo, setModo] = useState<ModoDoContato>("existente");
  return (
    <form aria-label="formulario">
      <ModosDoContato modo={modo} aoTrocar={setModo} rotulo="Contato do cliente" comParceiro={comParceiro} />
    </form>
  );
}

describe("ModosDoContato", () => {
  it("sem comParceiro, só os dois de sempre", () => {
    render(<Modos />);
    expect(screen.getByRole("button", { name: "Contato existente" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Novo contato" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Parceiro" })).toBeNull();
  });

  it("com comParceiro, o terceiro modo grava modo_contato = parceiro", () => {
    render(<Modos comParceiro />);
    fireEvent.click(screen.getByRole("button", { name: "Parceiro" }));
    expect(screen.getByRole("button", { name: "Parceiro" })).toHaveAttribute("aria-pressed", "true");
    const form = screen.getByRole("form", { name: "formulario" }) as HTMLFormElement;
    expect(new FormData(form).get("modo_contato")).toBe("parceiro");
  });
});
