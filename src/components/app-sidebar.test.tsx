import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { esquecerUsuarioLocal } from "@/lib/local/usuario";

/**
 * O menu lateral não pode falar pela pessoa errada.
 *
 * A casca de `/configuracoes` fica guardada pelo service worker para abrir
 * offline, e ela inclui este menu, com nome, e-mail e organização de quem
 * estava logado quando foi guardada. Num aparelho compartilhado, a segunda
 * pessoa abriria a tela com **os dados dela** e o **nome da primeira** no
 * canto — a tela mentindo, que é o que esta arquitetura existe para evitar.
 *
 * A casca diz para quem foi desenhada; o aparelho diz quem está logado.
 * Divergiu, o menu cala o que não pode confirmar.
 */

const ANA = "11111111-1111-4111-8111-111111111111";
const BRUNO = "33333333-3333-4333-8333-333333333333";

let sessao: { user: { id: string; email?: string } } | null = null;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: sessao } }) },
  }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/configuracoes/tags" }));
vi.mock("@/features/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/local/sincronizador", () => ({
  ligarSincronia: () => () => {},
  bancoDoUsuario: () => ({}),
}));

const { AppSidebar } = await import("./app-sidebar");

const daAna = {
  cascaDe: ANA,
  userName: "Ana Ribeiro",
  userEmail: "ana@duli.com",
  organizationName: "Duli Consulting",
  roleLabel: "Colaborador",
};

beforeEach(() => {
  esquecerUsuarioLocal();
  localStorage.clear();
});

describe("identidade do menu lateral", () => {
  it("mostra quem é quando a casca e o aparelho concordam", async () => {
    sessao = { user: { id: ANA, email: "ana@duli.com" } };

    render(<AppSidebar {...daAna} />);

    expect(await screen.findByText("Ana Ribeiro")).toBeTruthy();
    expect(screen.getByText("Duli Consulting")).toBeTruthy();
  });

  it("casca de uma pessoa e sessão de outra: cala o nome da casca", async () => {
    sessao = { user: { id: BRUNO, email: "bruno@duli.com" } };

    render(<AppSidebar {...daAna} />);

    expect(await screen.findByText("bruno@duli.com")).toBeTruthy();
    expect(screen.queryByText("Ana Ribeiro")).toBeNull();
    expect(screen.queryByText("Duli Consulting")).toBeNull();
  });
});
