import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ViaDoParceiro } from "./via-do-parceiro";

describe("ViaDoParceiro", () => {
  // O contato do cliente de parceiro é o do parceiro (PAR-6): o "via" diz de quem.
  it("diz de quem é o contato", () => {
    render(<ViaDoParceiro nome="Thais Fabrini" />);
    expect(screen.getByText("via Thais Fabrini")).toBeInTheDocument();
  });
});
