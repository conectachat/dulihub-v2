import "fake-indexeddb/auto";

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BancoLocal } from "@/lib/local/banco";
import { BancoDaFila } from "@/lib/local/banco-da-fila";
import { definirEstado } from "@/lib/local/estado";

/**
 * A Configuração desenhando **do espelho**, sem servidor.
 *
 * É o teste que prova a virada: a tela não busca mais dado no servidor, e o
 * que aparece vem do banco dentro do aparelho. Aqui o IndexedDB é o
 * `fake-indexeddb`, e o espelho é semeado à mão.
 *
 * O caso que mais importa é o do espelho **vazio**: a tela tem de dizer
 * "sincronizando" ou "este aparelho ainda não baixou", nunca "não existe" —
 * a confusão que leva alguém a recriar o que já está lá, e que a 0011
 * documentou no catálogo de documentos.
 */

const USUARIO = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";

// As gravações têm teste próprio (`escritas-locais.test.ts`); aqui o que
// importa é o que a tela desenha.
vi.mock("@/features/settings/escritas-locais", () => ({
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
  saveParceiro: vi.fn(),
}));

const { SecaoParceiros, SecaoTags } = await import("./secoes-locais");

let banco: BancoLocal;
let fila: BancoDaFila;

beforeEach(async () => {
  banco = new BancoLocal(USUARIO);
  await banco.open();
  fila = new BancoDaFila(USUARIO);
  await fila.open();
  definirEstado({ em: null, sincronizando: true, error: null, online: true });
});

afterEach(async () => {
  banco.close();
  fila.close();
  await BancoLocal.delete(`dulihub-${USUARIO}`);
  await BancoDaFila.delete(`dulihub-fila-${USUARIO}`);
});

async function semear() {
  await banco.tabela("tags").bulkPut([
    { id: "t1", organization_id: ORG, name: "EB-1A", color: "#f60", updated_at: "2026-09-21T10:00:00Z" },
    { id: "t2", organization_id: ORG, name: "Indicação", color: null, updated_at: "2026-09-21T10:00:00Z" },
  ]);
  await banco.tabela("person_tags").bulkPut([
    { person_id: "p1", tag_id: "t1", organization_id: ORG, updated_at: "2026-09-21T10:00:00Z" },
    { person_id: "p2", tag_id: "t1", organization_id: ORG, updated_at: "2026-09-21T10:00:00Z" },
  ]);
  definirEstado({ em: "2026-09-21T10:05:00Z", sincronizando: false });
}

describe("Configuração lendo do espelho", () => {
  it("mostra as tags guardadas no aparelho, com a contagem de contatos", async () => {
    await semear();
    render(<SecaoTags userId={USUARIO} />);

    // `findAllBy`: o editor guarda o nome também num campo escondido, que
    // viaja junto na gravação.
    expect(await screen.findAllByDisplayValue("EB-1A")).not.toHaveLength(0);
    expect(await screen.findAllByDisplayValue("Indicação")).not.toHaveLength(0);
    // A contagem não é coluna: é montada por `montagem.ts`, o mesmo código
    // que o servidor usava.
    expect(await screen.findByText(/2 contatos/)).toBeTruthy();
  });

  it("espelho vazio e sincronizando diz isso — não 'nenhuma tag'", async () => {
    render(<SecaoTags userId={USUARIO} />);
    expect(await screen.findByText(/Sincronizando com o servidor/)).toBeTruthy();
  });

  it("espelho vazio e sem internet explica o que fazer", async () => {
    definirEstado({ em: null, sincronizando: false, online: false });
    render(<SecaoTags userId={USUARIO} />);

    expect(
      await screen.findByText(/ainda não baixou a configuração/),
    ).toBeTruthy();
  });

  it("a tela acompanha a sincronia: tag nova aparece sem recarregar", async () => {
    await semear();
    render(<SecaoTags userId={USUARIO} />);
    await screen.findAllByDisplayValue("EB-1A");

    // O que a sincronia faria ao trazer novidade do servidor.
    await banco.tabela("tags").put({
      id: "t3",
      organization_id: ORG,
      name: "Chegou agora",
      color: null,
      updated_at: "2026-09-21T11:00:00Z",
    });

    await waitFor(() =>
      expect(screen.getAllByDisplayValue("Chegou agora")).not.toHaveLength(0),
    );
  });

  it("o que está na fila aparece na tela, e some quando sobe", async () => {
    await semear();
    // O que uma gravação offline deixa: a linha **não** entra na tabela
    // espelhada — entra na fila, e a leitura a põe por cima.
    await fila.fila.put({
      id: "f1",
      alvo: "t9",
      depende: [],
      passos: [
        {
          tipo: "insert",
          tabela: "tags",
          linha: { id: "t9", organization_id: ORG, name: "Feita no avião", color: null },
        },
      ],
      rotulo: "Criar a tag Feita no avião",
      criada_em: "2026-09-21T11:00:00Z",
      estado: "pendente",
      enviada_em: null,
      motivo: null,
    });

    render(<SecaoTags userId={USUARIO} />);
    const naFila = (await screen.findAllByDisplayValue("Feita no avião")).length;
    expect(naFila).toBeGreaterThan(0);
    // E a linha diz o que é: está aqui, não está no servidor.
    expect(screen.getByText("Só neste aparelho")).toBeTruthy();

    // Subiu: a sincronia traz a linha de verdade e o item sai da fila. A
    // linha tem o mesmo id nos dois lados — é o id gerado no aparelho —,
    // então ela troca de lugar sem duplicar na tela.
    await banco.tabela("tags").put({
      id: "t9",
      organization_id: ORG,
      name: "Feita no avião",
      color: null,
      updated_at: "2026-09-21T11:05:00Z",
    });
    await fila.fila.delete("f1");

    await waitFor(() =>
      expect(screen.queryByText("Só neste aparelho")).toBeNull(),
    );
    expect(screen.getAllByDisplayValue("Feita no avião")).toHaveLength(naFila);
  });
});

describe("Configuração › Parceiros", () => {
  // Só o dono da Duli cadastra parceiro (0068). A tela decide só o que
  // aparece; quem recusa é o banco.
  async function semearParceiros(papel: "owner" | "staff", comThais = true) {
    await banco.tabela("organizations").bulkPut([
      { id: ORG, name: "Duli", slug: "duli", type: "root", is_test: false, updated_at: "2026-09-21T10:00:00Z" },
      ...(comThais
        ? [
            {
              id: "thais",
              name: "Thais Fabrini",
              slug: "thais-fabrini",
              type: "partner",
              is_test: false,
              address_country: "Estados Unidos",
              email: "thais@exemplo.com",
              phone_country_code: "+1",
              phone: "3055550100",
              updated_at: "2026-09-21T10:00:00Z",
            },
          ]
        : []),
    ]);
    await banco.tabela("organization_members").put({
      id: "m1",
      user_id: USUARIO,
      organization_id: ORG,
      role: papel,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2026-09-21T10:00:00Z",
    });
    await banco.tabela("people").bulkPut(
      [1, 2, 3].map((n) => ({
        id: `c${n}`,
        organization_id: ORG,
        full_name: `Cliente ${n}`,
        lifecycle_stage: "client",
        deleted_at: null,
        partner_organization_id: "thais",
        updated_at: "2026-09-21T10:00:00Z",
      })),
    );
    definirEstado({ em: "2026-09-21T10:05:00Z", sincronizando: false });
  }

  it("o dono da Duli vê o parceiro com país, contato e clientes, e os botões", async () => {
    await semearParceiros("owner");
    render(<SecaoParceiros userId={USUARIO} />);

    expect((await screen.findAllByText("Thais Fabrini")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Estados Unidos").length).toBeGreaterThan(0);
    expect(screen.getAllByText("thais@exemplo.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+1 3055550100").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3 clientes").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Novo parceiro/ })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Editar Thais Fabrini" }).length).toBeGreaterThan(0);
  });

  it("quem não é dono da Duli lê a lista sem os botões", async () => {
    await semearParceiros("staff");
    render(<SecaoParceiros userId={USUARIO} />);

    expect((await screen.findAllByText("Thais Fabrini")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Novo parceiro/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Editar Thais Fabrini" })).toBeNull();
  });

  it("sem parceiro, diz o que é a tela", async () => {
    await semearParceiros("owner", false);
    render(<SecaoParceiros userId={USUARIO} />);

    expect(await screen.findByText("Nenhum parceiro ainda")).toBeTruthy();
    expect(
      screen.getByText("Cadastre aqui quem vende e contrata a Duli para montar o processo."),
    ).toBeTruthy();
  });
});
