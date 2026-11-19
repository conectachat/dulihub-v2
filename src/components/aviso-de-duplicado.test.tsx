import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { gravou } from "@/lib/action-state";
import type { ContatoParecido } from "@/lib/parecidos";

import { AvisoDeDuplicado } from "./aviso-de-duplicado";

/**
 * O aviso de contato já cadastrado (CON-4): diz o que bateu e com quem,
 * deixa conferir pelo link, e pergunta antes de duplicar — "É a mesma
 * pessoa?"; no "Não", "Criar outro contato com essas informações?".
 */

const PARECIDO: ContatoParecido = {
  id: "p1",
  nome: "Carlos Souza",
  estagio: "client",
  naLixeira: false,
  bateEmail: false,
  bateTelefone: true,
};

function montar(props: Partial<React.ComponentProps<typeof AvisoDeDuplicado>> = {}) {
  const aoUsarExistente = vi.fn();
  const aoGravarMesmoAssim = vi.fn();
  render(
    <AvisoDeDuplicado
      parecidos={[PARECIDO]}
      modo="criar"
      aoUsarExistente={aoUsarExistente}
      aoGravarMesmoAssim={aoGravarMesmoAssim}
      {...props}
    />,
  );
  return { aoUsarExistente, aoGravarMesmoAssim };
}

describe("AvisoDeDuplicado", () => {
  it("diz qual dado bateu, com quem, o estágio e o link", () => {
    montar();

    expect(screen.getByText(/Telefone já cadastrado em/)).toBeInTheDocument();
    expect(screen.getByText(/\(cliente\)/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Carlos Souza" });
    // Cliente: o link vai ao perfil de cliente, não ao de contato (CLI-2).
    expect(link).toHaveAttribute("href", "/clientes/p1");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("com mais de um parecido, cada botão diz de quem é", () => {
    // Revisão de 18/nov (4ª): no leitor de tela, dois "Sim, é a mesma
    // pessoa" iguais não dizem qual contato cada um escolhe.
    montar({
      parecidos: [PARECIDO, { ...PARECIDO, id: "p2", nome: "Ana Lima", naLixeira: true }],
      aoRestaurar: vi.fn(async () => gravou()),
    });

    expect(
      screen.getByRole("button", { name: "Sim, é a mesma pessoa: Carlos Souza" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restaurar Ana Lima" })).toBeInTheDocument();
  });

  it("e-mail e telefone juntos dizem os dois", () => {
    montar({ parecidos: [{ ...PARECIDO, bateEmail: true }] });

    expect(screen.getByText(/E-mail e telefone já cadastrados em/)).toBeInTheDocument();
  });

  it("marca quem está na lixeira e oferece Restaurar", async () => {
    const aoRestaurar = vi.fn(async () => gravou());
    const { aoUsarExistente } = montar({
      parecidos: [{ ...PARECIDO, naLixeira: true }],
      aoRestaurar,
    });

    expect(screen.getByText(/na lixeira/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Restaurar / }));

    await waitFor(() => expect(aoUsarExistente).toHaveBeenCalledWith("p1", "client"));
    expect(aoRestaurar).toHaveBeenCalledWith("p1");
  });

  it("enquanto restaura, nenhum outro botão do aviso grava", () => {
    // Revisão de 18/nov, rodada 2: "Restaurar" e depois "Sim" em outro
    // parecido criavam duas oportunidades.
    const aoRestaurar = vi.fn(() => new Promise<never>(() => {}));
    montar({
      parecidos: [{ ...PARECIDO, naLixeira: true }, { ...PARECIDO, id: "p2", nome: "Caio Reis" }],
      aoRestaurar,
    });

    fireEvent.click(screen.getByRole("button", { name: /^Restaurar / }));

    expect(screen.getByRole("button", { name: /^Sim, é a mesma pessoa/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Não, é outra pessoa" })).toBeDisabled();
  });

  it("no criar, Não pergunta 'Criar outro contato com essas informações?' e Criar mesmo assim confirma", () => {
    const { aoGravarMesmoAssim, aoUsarExistente } = montar();

    fireEvent.click(screen.getByRole("button", { name: "Não, é outra pessoa" }));
    expect(screen.getByText("Criar outro contato com essas informações?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Criar mesmo assim" }));
    expect(aoGravarMesmoAssim).toHaveBeenCalledTimes(1);
    expect(aoUsarExistente).not.toHaveBeenCalled();
  });

  it("no editar, Sim abre o existente e não grava", () => {
    const { aoGravarMesmoAssim, aoUsarExistente } = montar({ modo: "editar" });

    fireEvent.click(screen.getByRole("button", { name: /^Sim, é a mesma pessoa/ }));

    expect(aoUsarExistente).toHaveBeenCalledWith("p1", "client");
    expect(aoGravarMesmoAssim).not.toHaveBeenCalled();
  });

  it("no editar, o Não pergunta se salva mesmo assim", () => {
    const { aoGravarMesmoAssim } = montar({ modo: "editar" });

    fireEvent.click(screen.getByRole("button", { name: "Não, é outra pessoa" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar mesmo assim" }));

    expect(aoGravarMesmoAssim).toHaveBeenCalledTimes(1);
  });
});
