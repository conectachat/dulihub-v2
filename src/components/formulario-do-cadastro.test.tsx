import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EstadoDaFicha } from "@/features/cadastro/estado";

import { FormularioDoCadastro } from "./formulario-do-cadastro";

/**
 * A ficha de cadastro, desenhada — a mesma tela para o lead e para a equipe.
 *
 * As regras têm teste próprio (`features/cadastro/schema.test.ts`). Aqui se
 * prova o que a pessoa vive: o erro aparece **no campo**, o servidor só é
 * chamado com a ficha certa, e uma recusa não apaga o que foi digitado — que
 * é o motivo de este formulário não usar `<form action>`.
 */

const COMPLETA = {
  full_name: "Ana de Teste",
  birth_date: "1990-05-20",
  tax_id: "52998224725",
  national_id: "1234567",
  national_id_issuer: "SSP/MA",
  gender: "feminino",
  marital_status: "casado",
  birthplace: "São Luís",
  nationality: "Brasileira",
  email: "ana@example.com",
  phone_country_code: "+55",
  phone: "98999990000",
  address_street: "Rua da Filosofia",
  address_number: "10",
  address_complement: null,
  address_district: "Cohafuma",
  address_city: "São Luís",
  address_state: "MA",
  address_country: "Brasil",
  address_postal_code: "65000000",
};

const DECLARACAO = "Declaro que as informações acima são verdadeiras.";

function montar(props: Partial<React.ComponentProps<typeof FormularioDoCadastro>> = {}) {
  const enviar = vi.fn<(fd: FormData) => Promise<EstadoDaFicha>>(async () => ({
    error: null,
  }));
  const aoGravar = vi.fn();
  render(
    <FormularioDoCadastro
      modo="completa"
      inicial={COMPLETA}
      enviar={enviar}
      aoGravar={aoGravar}
      rotuloDoEnvio="Enviar ficha"
      {...props}
    />,
  );
  return { enviar, aoGravar };
}

const enviarFormulario = () =>
  fireEvent.click(screen.getByRole("button", { name: "Enviar ficha" }));

describe("FormularioDoCadastro", () => {
  it("mostra CPF e CEP com máscara, venham como vierem do banco", () => {
    montar();

    expect((screen.getByLabelText("CPF *") as HTMLInputElement).value).toBe(
      "529.982.247-25",
    );
    expect((screen.getByLabelText("CEP *") as HTMLInputElement).value).toBe("65000-000");
  });

  it("ficha certa chega ao servidor e avisa que gravou", async () => {
    const { enviar, aoGravar } = montar();

    enviarFormulario();

    await waitFor(() => expect(aoGravar).toHaveBeenCalledTimes(1));
    const enviado = enviar.mock.calls[0][0];
    expect(enviado.get("full_name")).toBe("Ana de Teste");
    expect(enviado.get("tax_id")).toBe("529.982.247-25");
  });

  it("campo errado é apontado no campo, e o servidor nem é chamado", async () => {
    const { enviar, aoGravar } = montar();

    fireEvent.change(screen.getByLabelText("CPF *"), {
      target: { value: "529.982.247-26" },
    });
    fireEvent.change(screen.getByLabelText("Cidade *"), { target: { value: "" } });
    enviarFormulario();

    expect(await screen.findByText(/CPF inválido/)).toBeTruthy();
    expect(screen.getByText("Preencha este campo")).toBeTruthy();
    expect(screen.getByLabelText("CPF *").getAttribute("aria-invalid")).toBe("true");
    expect(enviar).not.toHaveBeenCalled();
    expect(aoGravar).not.toHaveBeenCalled();
  });

  it("com declaração, não envia sem o aceite", async () => {
    const { enviar } = montar({ declaracao: DECLARACAO });

    enviarFormulario();
    expect(await screen.findByText("Marque para enviar")).toBeTruthy();
    expect(enviar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox"));
    enviarFormulario();
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
  });

  it("recusa do servidor aparece e não apaga o que foi digitado", async () => {
    const { enviar, aoGravar } = montar();
    enviar.mockResolvedValueOnce({ error: "Este link não está mais disponível." });

    fireEvent.change(screen.getByLabelText("Bairro *"), {
      target: { value: "Renascença" },
    });
    enviarFormulario();

    expect(await screen.findByText("Este link não está mais disponível.")).toBeTruthy();
    expect((screen.getByLabelText("Bairro *") as HTMLInputElement).value).toBe("Renascença");
    expect(aoGravar).not.toHaveBeenCalled();
  });

  it("dependente: adiciona linha, envia junto, e linha pela metade é recusada", async () => {
    const { enviar } = montar();

    fireEvent.click(screen.getByRole("button", { name: /Adicionar dependente/ }));
    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "Bia de Teste" },
    });
    enviarFormulario();

    expect(
      await screen.findByText(/Preencha nome, relacionamento, data de nascimento e país/),
    ).toBeTruthy();
    expect(enviar).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Relacionamento"), {
      target: { value: "child" },
    });
    // A data de nascimento do contratante tem asterisco; esta, não.
    fireEvent.change(screen.getByLabelText("Data de nascimento"), {
      target: { value: "2015-01-10" },
    });
    fireEvent.change(screen.getByLabelText("País de nascimento"), {
      target: { value: "Brasil" },
    });
    enviarFormulario();

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0][0].getAll("dep_full_name")).toEqual(["Bia de Teste"]);
  });

  it("na porta da equipe só o nome é obrigatório", async () => {
    const { enviar } = montar({
      modo: "parcial",
      inicial: { full_name: "Ana" },
      rotuloDoEnvio: "Enviar ficha",
    });

    // Sem asterisco: o campo existe, mas não é exigido.
    expect(screen.getByLabelText("CPF")).toBeTruthy();
    enviarFormulario();

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
  });
});
