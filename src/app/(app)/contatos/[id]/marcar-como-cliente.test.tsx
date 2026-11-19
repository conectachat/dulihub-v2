import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * "Marcar como cliente" (CLI-11): só a gestão vê o botão (a página decide; o
 * banco recusa os outros). Pergunta a data — hoje por padrão, nunca no
 * futuro — e avisa que não tem volta.
 */

vi.mock("@/features/people/actions", () => ({ marcarComoCliente: vi.fn() }));

const { MarcarComoCliente } = await import("./marcar-como-cliente");

describe("MarcarComoCliente", () => {
  it("avisa que não tem volta e pede a data, hoje por padrão", () => {
    render(<MarcarComoCliente personId="p1" nome="Carla Souza" hoje="2026-11-19" />);
    fireEvent.click(screen.getByRole("button", { name: "Marcar como cliente" }));

    expect(screen.getByText(/Não tem volta: cliente não volta a ser lead\./)).toBeTruthy();
    const data = screen.getByLabelText("Cliente desde") as HTMLInputElement;
    expect(data.type).toBe("date");
    expect(data.value).toBe("2026-11-19");
    expect(data.max).toBe("2026-11-19");
  });
});
