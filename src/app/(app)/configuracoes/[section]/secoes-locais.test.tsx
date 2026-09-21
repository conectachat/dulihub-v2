import "fake-indexeddb/auto";

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BancoLocal } from "@/lib/local/banco";
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

vi.mock("@/features/settings/tag-actions", () => ({
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}));

const { SecaoTags } = await import("./secoes-locais");

let banco: BancoLocal;

beforeEach(async () => {
  banco = new BancoLocal(USUARIO);
  await banco.open();
  definirEstado({ em: null, sincronizando: true, error: null, online: true });
});

afterEach(async () => {
  banco.close();
  await BancoLocal.delete(`dulihub-${USUARIO}`);
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
});
