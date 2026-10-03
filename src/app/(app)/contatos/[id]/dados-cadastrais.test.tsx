import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CadastroDoContato } from "@/features/cadastro/queries";

import { DadosCadastrais } from "./dados-cadastrais";

// O cartão só desenha; as ações são do servidor e têm teste contra o banco.
vi.mock("@/features/cadastro/actions", () => ({
  salvarCadastro: vi.fn(),
  gerarLink: vi.fn(),
  cancelarLink: vi.fn(),
  marcarConferida: vi.fn(),
}));

/**
 * O cartão "Dados cadastrais" da ficha do contato: o que a equipe lê antes de
 * montar o contrato, e o estado do link que o lead recebeu.
 */

const AGORA = new Date("2026-10-03T12:00:00Z");
const ORIGEM = "https://hub.example";

const VAZIA: CadastroDoContato["ficha"] = {
  full_name: "Ana de Teste",
  birth_date: null,
  gender: null,
  marital_status: null,
  birthplace: null,
  nationality: null,
  tax_id: null,
  national_id: null,
  national_id_issuer: null,
  email: null,
  phone_country_code: "+55",
  phone: "98999990000",
  address_street: null,
  address_number: null,
  address_complement: null,
  address_district: null,
  address_city: null,
  address_state: null,
  address_country: null,
  address_postal_code: null,
};

const PREENCHIDA: CadastroDoContato["ficha"] = {
  ...VAZIA,
  birth_date: "1990-05-20",
  gender: "feminino",
  marital_status: "casado",
  birthplace: "São Luís",
  nationality: "Brasileira",
  tax_id: "52998224725",
  national_id: "1234567",
  national_id_issuer: "SSP/MA",
  address_street: "Rua da Filosofia",
  address_number: "10",
  address_district: "Cohafuma",
  address_city: "São Luís",
  address_state: "MA",
  address_country: "Brasil",
  address_postal_code: "65000000",
};

const link = (campos: Partial<NonNullable<CadastroDoContato["link"]>> = {}) => ({
  id: "l1",
  token: "tok-do-teste",
  expires_at: "2026-10-18T12:00:00Z",
  cancelled_at: null,
  submitted_at: null,
  reviewed_at: null,
  ...campos,
});

function montar(cadastro: Partial<CadastroDoContato>) {
  render(
    <DadosCadastrais
      personId="p1"
      cadastro={{ ficha: VAZIA, dependentes: [], link: null, ...cadastro }}
      origem={ORIGEM}
      agora={AGORA}
    />,
  );
}

describe("DadosCadastrais", () => {
  it("sem dado nenhum, diz isso e oferece o link", () => {
    montar({});

    expect(screen.getByText(/Nenhum dado cadastral ainda/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Gerar link da ficha/ })).toBeTruthy();
  });

  it("mostra a ficha como vai para o contrato: CPF com máscara, data por extenso curto", () => {
    montar({
      ficha: PREENCHIDA,
      dependentes: [
        {
          full_name: "Bia de Teste",
          relationship: "child",
          birth_date: "2015-01-10",
          birth_country: "Brasil",
        },
      ],
    });

    expect(screen.getByText("529.982.247-25")).toBeTruthy();
    expect(screen.getByText("20/05/1990")).toBeTruthy();
    expect(screen.getByText("1234567 · SSP/MA")).toBeTruthy();
    expect(screen.getByText("Casado(a)")).toBeTruthy();
    expect(screen.getByText(/Rua da Filosofia, 10/)).toBeTruthy();
    expect(screen.getByText(/65000-000/)).toBeTruthy();
    expect(screen.getByText("Bia de Teste")).toBeTruthy();
    expect(screen.getByText(/Filho\(a\) · 10\/01\/2015 · Brasil/)).toBeTruthy();
  });

  it("link aguardando: mostra o endereço, o prazo e o atalho do WhatsApp", () => {
    montar({ link: link() });

    expect(screen.getByText("Aguardando o cliente")).toBeTruthy();
    expect(screen.getByDisplayValue(`${ORIGEM}/cadastro/tok-do-teste`)).toBeTruthy();
    expect(screen.getByText(/vale até 18\/10\/2026/)).toBeTruthy();

    const whatsapp = screen.getByRole("link", { name: /WhatsApp/ });
    expect(whatsapp.getAttribute("href")).toContain("https://wa.me/5598999990000?text=");
    expect(whatsapp.getAttribute("href")).toContain(
      encodeURIComponent(`${ORIGEM}/cadastro/tok-do-teste`),
    );
  });

  it("sem telefone, o atalho do WhatsApp não aparece — só o copiar", () => {
    montar({ ficha: { ...VAZIA, phone: null }, link: link() });

    expect(screen.queryByRole("link", { name: /WhatsApp/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Copiar/ })).toBeTruthy();
  });

  it("link expirado: avisa e deixa gerar outro, sem mostrar o endereço morto", () => {
    montar({ link: link({ expires_at: "2026-10-01T12:00:00Z" }) });

    expect(screen.getByText("Link expirado")).toBeTruthy();
    expect(screen.queryByDisplayValue(/cadastro\/tok-do-teste/)).toBeNull();
    expect(screen.getByRole("button", { name: /Gerar novo link/ })).toBeTruthy();
  });

  it("ficha recebida pede conferência; conferida, para de pedir", () => {
    montar({ ficha: PREENCHIDA, link: link({ submitted_at: "2026-10-02T15:00:00Z" }) });

    expect(screen.getByText("Ficha recebida")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Conferi/ })).toBeTruthy();
  });

  it("ficha conferida não pede mais nada, e ainda deixa gerar outro link", () => {
    montar({
      ficha: PREENCHIDA,
      link: link({
        submitted_at: "2026-10-02T15:00:00Z",
        reviewed_at: "2026-10-03T09:00:00Z",
      }),
    });

    expect(screen.getByText("Ficha conferida")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Conferi/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Gerar novo link/ })).toBeTruthy();
  });
});
