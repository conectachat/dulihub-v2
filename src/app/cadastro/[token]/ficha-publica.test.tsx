import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FichaPublica } from "./ficha-publica";

const enviarFicha = vi.hoisted(() => vi.fn());
vi.mock("@/features/cadastro/publico-actions", () => ({ enviarFicha }));

/**
 * A ficha na mão do lead: chega com o que ele já deu, exige o aceite, e
 * depois de enviada vira recibo — o link já não vale, não há para onde voltar.
 */

const props = {
  token: "tok-do-teste",
  nome: "Ana de Teste",
  email: "ana@example.com",
  ddi: "+55",
  telefone: "98999990000",
  declaracao: "Declaro que as informações acima são verdadeiras.",
  organizacao: "Duli Consulting",
};

const preencher = (rotulo: string, valor: string) =>
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

describe("FichaPublica", () => {
  it("chega com nome, e-mail e telefone que o lead já tinha dado", () => {
    render(<FichaPublica {...props} />);

    expect((screen.getByLabelText("Nome completo *") as HTMLInputElement).value).toBe(
      "Ana de Teste",
    );
    expect((screen.getByLabelText("E-mail *") as HTMLInputElement).value).toBe(
      "ana@example.com",
    );
    // O resto vem em branco: a página pública não recebe documento nem endereço.
    expect((screen.getByLabelText("CPF *") as HTMLInputElement).value).toBe("");
  });

  it("preenchida e aceita, envia com o token do endereço e vira recibo", async () => {
    enviarFicha.mockResolvedValueOnce({ error: null });
    window.scrollTo = vi.fn();
    render(<FichaPublica {...props} />);

    preencher("Data de nascimento *", "1990-05-20");
    preencher("CPF *", "529.982.247-25");
    preencher("RG *", "1234567");
    preencher("Órgão expedidor *", "SSP/MA");
    preencher("Sexo *", "feminino");
    preencher("Estado civil *", "casado");
    preencher("Naturalidade *", "São Luís");
    preencher("Nacionalidade *", "Brasileira");
    preencher("CEP *", "65000-000");
    preencher("Endereço *", "Rua da Filosofia");
    preencher("Número *", "10");
    preencher("Bairro *", "Cohafuma");
    preencher("Cidade *", "São Luís");
    preencher("Estado *", "MA");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar ficha" }));

    expect(await screen.findByText("Recebemos a sua ficha")).toBeTruthy();
    expect(enviarFicha).toHaveBeenCalledTimes(1);
    expect(enviarFicha.mock.calls[0][0]).toBe("tok-do-teste");
    // O formulário some, e a instrução de preencher some com ele: não há o
    // que reenviar, e "preencha os dados abaixo" em cima do recibo confunde.
    expect(screen.queryByRole("button", { name: "Enviar ficha" })).toBeNull();
    expect(screen.queryByText(/Preencha os dados abaixo/)).toBeNull();
  });
});
