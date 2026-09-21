import "fake-indexeddb/auto";

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BancoLocal } from "@/lib/local/banco";
import { definirEstado } from "@/lib/local/estado";
import { esquecerUsuarioLocal } from "@/lib/local/usuario";

/**
 * De quem é o aparelho — e por que a casca não pode responder isso.
 *
 * O service worker guarda a **casca** da rota `/configuracoes` para abrir
 * offline. Casca é HTML igual para todo mundo; enquanto ela carregava o
 * `userId` resolvido no servidor, não era. Num computador compartilhado, a
 * casca guardada por uma pessoa abriria, offline, o banco local **da outra**
 * — e com a fila de gravações isso vira escrita atribuída a quem não fez.
 *
 * Agora quem responde é a sessão guardada no próprio aparelho. Este teste
 * encena exatamente o caso: casca de Ana em cache, sessão de Bruno no
 * navegador.
 */

const ANA = "11111111-1111-4111-8111-111111111111";
const BRUNO = "33333333-3333-4333-8333-333333333333";
const ORG = "22222222-2222-4222-8222-222222222222";

let sessao: { user: { id: string } } | null = { user: { id: BRUNO } };

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: sessao } }) },
  }),
}));

vi.mock("@/features/settings/tag-actions", () => ({
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}));

const { SecoesDoAparelho } = await import("./secoes-locais");

const bancos: BancoLocal[] = [];

async function semear(userId: string, nome: string) {
  const banco = new BancoLocal(userId);
  await banco.open();
  bancos.push(banco);
  await banco.tabela("tags").put({
    id: `tag-${userId}`,
    organization_id: ORG,
    name: nome,
    color: null,
    updated_at: "2026-09-21T10:00:00Z",
  });
  return banco;
}

beforeEach(() => {
  sessao = { user: { id: BRUNO } };
  // A resposta fica guardada no módulo: sem esquecer, o segundo teste herda
  // a sessão do primeiro. No app é o que se quer — uma pergunta por aba.
  esquecerUsuarioLocal();
  definirEstado({ em: "2026-09-21T10:05:00Z", sincronizando: false, error: null, online: true });
});

afterEach(async () => {
  for (const banco of bancos.splice(0)) banco.close();
  await BancoLocal.delete(`dulihub-${ANA}`);
  await BancoLocal.delete(`dulihub-${BRUNO}`);
});

describe("de quem é o aparelho", () => {
  it("abre o banco de quem está na sessão, não o da casca guardada", async () => {
    await semear(ANA, "Tag da Ana");
    await semear(BRUNO, "Tag do Bruno");

    render(<SecoesDoAparelho slug="tags" />);

    expect(await screen.findAllByDisplayValue("Tag do Bruno")).not.toHaveLength(0);
    expect(screen.queryByDisplayValue("Tag da Ana")).toBeNull();
  });

  it("sem sessão no aparelho, manda entrar — não mostra espelho nenhum", async () => {
    await semear(ANA, "Tag da Ana");
    sessao = null;

    render(<SecoesDoAparelho slug="tags" />);

    expect(await screen.findByText(/Entre de novo/)).toBeTruthy();
    expect(screen.queryByDisplayValue("Tag da Ana")).toBeNull();
  });
});
