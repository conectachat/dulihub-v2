import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * O Editar do cliente (CLI-10, CLI-12): os campos do contato, e mais dono,
 * cliente desde e participantes — escolhidos entre os membros da
 * organização **da pessoa**.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/people/actions", () => ({
  atualizarCliente: vi.fn(async () => ({ error: null })),
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
  restorePerson: vi.fn(),
}));

const { ClienteDialog } = await import("./cliente-dialog");

const CLIENTE = {
  id: "p1",
  full_name: "Carla Souza",
  email: "carla@example.com",
  phone: "31999990000",
  phone_country_code: "+55",
  company: null,
  job_title: null,
  owner_id: "u2",
  client_since: "2026-03-01",
};

const EQUIPE = [
  { id: "u1", nome: "Renato" },
  { id: "u2", nome: "Ana" },
  { id: "u3", nome: "Bruno" },
];

describe("ClienteDialog", () => {
  it("abre com o dono, a data e os participantes atuais", () => {
    render(
      <ClienteDialog cliente={CLIENTE} equipe={EQUIPE} participantes={["u3"]} hoje="2026-11-19" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar Carla Souza" }));

    const dono = screen.getByLabelText("Dono") as HTMLSelectElement;
    expect(dono.value).toBe("u2");
    expect([...dono.options].map((o) => o.text)).toEqual(["Sem dono", "Renato", "Ana", "Bruno"]);

    const desde = screen.getByLabelText("Cliente desde") as HTMLInputElement;
    expect(desde.value).toBe("2026-03-01");
    expect(desde.max).toBe("2026-11-19");

    expect((screen.getByRole("checkbox", { name: "Bruno" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Renato" }) as HTMLInputElement).checked).toBe(false);
    // Os campos do contato continuam lá.
    expect((screen.getByLabelText("E-mail *") as HTMLInputElement).value).toBe("carla@example.com");
  });

  it("dono que não está na equipe visível continua escolhido, em vez de virar 'Sem dono'", () => {
    // Consultor de organização atribuída: não enxerga os membros da dona.
    render(
      <ClienteDialog
        cliente={CLIENTE}
        equipe={[]}
        participantes={[]}
        hoje="2026-11-19"
        nomeDoDono="Ana"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar Carla Souza" }));

    const dono = screen.getByLabelText("Dono") as HTMLSelectElement;
    expect(dono.value).toBe("u2");
    expect([...dono.options].map((o) => o.text)).toEqual(["Sem dono", "Ana"]);
  });
});
