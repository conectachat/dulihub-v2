import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TimelineItem } from "@/features/people/timeline-queries";

/**
 * A aba Notas do cliente (CLI-9): o campo de nota nova em cima, o histórico
 * logo abaixo, e as observações do cadastro antigo por último — são o
 * passado, e não podem empurrar o que acontece hoje para fora da tela.
 */

vi.mock("@/features/people/timeline-actions", () => ({
  createEntry: vi.fn(),
  deleteEntry: vi.fn(),
}));

const { AbaNotas } = await import("./aba-notas");

const ITENS: TimelineItem[] = [
  {
    id: "n1",
    kind: "note",
    type: "note",
    body: "Ligou pedindo o boleto",
    occurredAt: "2026-11-10T12:00:00Z",
    authorId: "u1",
    authorName: "Ana",
    system: false,
  },
  {
    id: "a1",
    kind: "activity",
    type: "virou_cliente",
    body: "Oportunidade ganha — virou cliente",
    occurredAt: "2026-11-01T12:00:00Z",
    authorId: "u1",
    authorName: "Ana",
    system: true,
  },
];

const antes = (a: Node, b: Node) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("aba Notas", () => {
  it("nota nova em cima, histórico no meio, cadastro antigo por último", () => {
    render(
      <AbaNotas
        personId="p1"
        items={ITENS}
        currentUserId="u1"
        observacoesAntigas="Cliente desde 2019 no app antigo."
      />,
    );

    const registrar = screen.getByRole("button", { name: "Registrar" });
    const nota = screen.getByText("Ligou pedindo o boleto");
    const antigas = screen.getByText("Observações do cadastro antigo");

    expect(antes(registrar, nota)).toBe(true);
    expect(antes(nota, antigas)).toBe(true);
  });

  it("virou cliente é do sistema: não tem excluir", () => {
    render(<AbaNotas personId="p1" items={ITENS} currentUserId="u1" observacoesAntigas={null} />);

    expect(screen.getByText("Oportunidade ganha — virou cliente")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Excluir/ })).toHaveLength(1);
    expect(screen.queryByText("Observações do cadastro antigo")).toBeNull();
  });
});
