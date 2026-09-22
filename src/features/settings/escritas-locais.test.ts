import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BancoLocal } from "@/lib/local/banco";
import { BancoDaFila } from "@/lib/local/banco-da-fila";
import { esquecerUsuarioLocal } from "@/lib/local/usuario";

/**
 * Gravar sem internet.
 *
 * A gravação não vai ao servidor: ela entra na fila deste aparelho e sobe
 * depois. O que se prova aqui é que ela entra **completa** — com id gerado
 * aqui (a chave de idempotência do replay), com a organização certa, e
 * recusando na hora o que o servidor recusaria horas depois.
 */

const USUARIO = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: USUARIO } } } }) },
  }),
}));

vi.mock("@/lib/local/sincronizador", async (original) => ({
  ...(await original<typeof import("@/lib/local/sincronizador")>()),
  // A drenagem tem teste próprio; aqui interessa o que fica guardado.
  sincronizarAgora: vi.fn(),
}));

const {
  createStage,
  createStageStatus,
  deleteStage,
  createTag,
  deleteStageStatus,
  deleteTag,
  moveStage,
  moveStageStatus,
  setDefaultStageStatus,
  updateTag,
} = await import("./escritas-locais");

let banco: BancoLocal;
let fila: BancoDaFila;

function formulario(campos: Record<string, string>) {
  const dados = new FormData();
  for (const [k, v] of Object.entries(campos)) dados.set(k, v);
  return dados;
}

beforeEach(async () => {
  esquecerUsuarioLocal();
  banco = new BancoLocal(USUARIO);
  await banco.open();
  fila = new BancoDaFila(USUARIO);
  await fila.open();

  await banco.tabela("organizations").put({
    id: ORG,
    name: "Duli",
    slug: "duli",
    type: "root",
    updated_at: "2026-09-21T10:00:00Z",
  });
  await banco.tabela("organization_members").put({
    id: "m1",
    user_id: USUARIO,
    organization_id: ORG,
    role: "admin",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2026-09-21T10:00:00Z",
  });
});

afterEach(async () => {
  banco.close();
  fila.close();
  await BancoLocal.delete(`dulihub-${USUARIO}`);
  await BancoDaFila.delete(`dulihub-fila-${USUARIO}`);
});

describe("createTag no aparelho", () => {
  it("entra na fila com id daqui e a organização do aparelho", async () => {
    const estado = await createTag({ error: null }, formulario({ name: "EB-1A", color: "#ff6600" }));

    expect(estado.error).toBeNull();
    const [item] = await fila.fila.toArray();
    expect(item.passos).toHaveLength(1);
    expect(item.passos[0]).toMatchObject({
      tipo: "insert",
      tabela: "tags",
      linha: { organization_id: ORG, name: "EB-1A", color: "#ff6600" },
    });
    // O id é gerado aqui: é ele que faz o replay bater na chave primária em
    // vez de criar uma segunda linha.
    expect(item.alvo).toMatch(/^[0-9a-f-]{36}$/);
    expect(item.rotulo).toContain("EB-1A");
  });

  it("nome repetido é recusado na hora, não horas depois", async () => {
    await banco.tabela("tags").put({
      id: "t1",
      organization_id: ORG,
      name: "EB-1A",
      color: null,
      updated_at: "2026-09-21T10:00:00Z",
    });

    const estado = await createTag({ error: null }, formulario({ name: "eb-1a", color: "#ff6600" }));

    expect(estado.error).toMatch(/já existe/i);
    expect(await fila.fila.count()).toBe(0);
  });

  it("aparelho que ainda não baixou nada não grava no escuro", async () => {
    await banco.tabela("organization_members").clear();

    const estado = await createTag({ error: null }, formulario({ name: "EB-1A", color: "#ff6600" }));

    expect(estado.error).toMatch(/ainda não baixou/i);
    expect(await fila.fila.count()).toBe(0);
  });

  it("entrada inválida não encosta na fila", async () => {
    const estado = await createTag({ error: null }, formulario({ name: "  ", color: "#ff6600" }));

    expect(estado.error).toBeTruthy();
    expect(await fila.fila.count()).toBe(0);
  });
});

describe("alterar o que ainda não subiu", () => {
  it("renomear uma tag criada offline fica dependendo dela", async () => {
    // Sem esta dependência, a recusa da criação deixaria o rename subir
    // sozinho contra uma linha que nunca existiu.
    await createTag({ error: null }, formulario({ name: "Rascunho", color: "#ff6600" }));
    const [criacao] = await fila.fila.toArray();

    await updateTag(formulario({ id: criacao.alvo, name: "Pronta", color: "#ff6600" }));

    const itens = await fila.fila.orderBy("criada_em").toArray();
    expect(itens).toHaveLength(2);
    expect(itens[1].depende).toEqual([criacao.alvo]);
    expect(itens[1].passos[0]).toMatchObject({ tipo: "update", tabela: "tags" });
  });

  it("apagar tag que já está no servidor não depende de ninguém", async () => {
    await banco.tabela("tags").put({
      id: "t1",
      organization_id: ORG,
      name: "Antiga",
      color: null,
      updated_at: "2026-09-21T10:00:00Z",
    });

    await deleteTag(formulario({ id: "t1" }));

    const [item] = await fila.fila.toArray();
    expect(item.depende).toEqual([]);
    expect(item.passos[0]).toMatchObject({ tipo: "delete", tabela: "tags", id: "t1" });
    expect(item.rotulo).toContain("Antiga");
  });
});

describe("status de etapa no aparelho", () => {
  async function semearStatus() {
    await banco.tabela("stage_statuses").bulkPut([
      {
        id: "s1",
        organization_id: ORG,
        code: "pendente",
        label: "Pendente",
        color: "#8a97aa",
        position: 0,
        is_default: true,
        is_done: false,
        is_system: true,
        updated_at: "2026-09-21T10:00:00Z",
      },
      {
        id: "s2",
        organization_id: ORG,
        code: "em_analise",
        label: "Em análise",
        color: "#ff6600",
        position: 1,
        is_default: false,
        is_done: false,
        is_system: false,
        updated_at: "2026-09-21T10:00:00Z",
      },
    ]);
  }

  it("nasce com código derivado do nome e na última posição", async () => {
    await semearStatus();

    await createStageStatus(
      { error: null },
      formulario({ label: "Aguardando cliente", color: "#0e7c6b" }),
    );

    const [item] = await fila.fila.toArray();
    expect(item.passos[0]).toMatchObject({
      tipo: "insert",
      tabela: "stage_statuses",
      linha: { code: "aguardando_cliente", position: 2, organization_id: ORG },
    });
  });

  it("nome que normaliza para código já existente é recusado na hora", async () => {
    await semearStatus();

    const estado = await createStageStatus(
      { error: null },
      formulario({ label: "em  análise!", color: "#0e7c6b" }),
    );

    expect(estado.error).toMatch(/já existe/i);
    expect(await fila.fila.count()).toBe(0);
  });

  it("status de fábrica não é enfileirado para exclusão", async () => {
    await semearStatus();

    const estado = await deleteStageStatus(formulario({ id: "s1" }));

    expect(estado.error).toMatch(/fábrica/i);
    expect(await fila.fila.count()).toBe(0);
  });

  it("trocar o padrão vai por RPC, não por dois updates", async () => {
    // Dois updates enfileirados, falhando no meio, deixariam a organização
    // sem padrão nenhum — e o índice único recusa os dois ao mesmo tempo.
    await semearStatus();

    await setDefaultStageStatus(formulario({ id: "s2" }));

    const [item] = await fila.fila.toArray();
    expect(item.passos).toEqual([
      { tipo: "rpc", nome: "set_default_stage_status", args: { p_id: "s2" } },
    ]);
  });

  it("reordenar manda a lista inteira, e o segundo clique substitui o primeiro", async () => {
    await semearStatus();

    await moveStageStatus(formulario({ id: "s2", direction: "up" }));
    expect(await fila.fila.count()).toBe(1);
    expect((await fila.fila.toArray())[0].passos[0]).toMatchObject({
      tipo: "rpc",
      nome: "reordenar_irmaos",
      args: { p_tabela: "stage_statuses", p_ids: ["s2", "s1"] },
    });

    // Volta ao lugar: a fila continua com um item, agora com a ordem final.
    await moveStageStatus(formulario({ id: "s2", direction: "down" }));

    const itens = await fila.fila.toArray();
    expect(itens).toHaveLength(1);
    expect(itens[0].passos[0]).toMatchObject({ args: { p_ids: ["s1", "s2"] } });
  });

  it("subir quem já é o primeiro não enfileira nada", async () => {
    await semearStatus();

    await moveStageStatus(formulario({ id: "s1", direction: "up" }));

    expect(await fila.fila.count()).toBe(0);
  });
});

describe("etapas do funil no aparelho", () => {
  const FUNIL = "p1";

  async function semearFunil() {
    await banco.tabela("pipelines").put({
      id: FUNIL,
      organization_id: ORG,
      name: "Padrão",
      is_default: true,
      position: 0,
      updated_at: "2026-09-21T10:00:00Z",
    });
    await banco.tabela("pipeline_stages").bulkPut([
      { id: "e1", organization_id: ORG, pipeline_id: FUNIL, name: "Novo", position: 0, is_won: false, is_lost: false, updated_at: "2026-09-21T10:00:00Z" },
      { id: "e2", organization_id: ORG, pipeline_id: FUNIL, name: "Proposta", position: 1, is_won: false, is_lost: false, updated_at: "2026-09-21T10:00:00Z" },
      { id: "ganho", organization_id: ORG, pipeline_id: FUNIL, name: "Ganho", position: 98, is_won: true, is_lost: false, updated_at: "2026-09-21T10:00:00Z" },
    ]);
  }

  it("nasce antes das terminais, com a organização do funil", async () => {
    await semearFunil();

    await createStage({ error: null }, formulario({ name: "Negociação", pipeline_id: FUNIL }));

    const [item] = await fila.fila.toArray();
    expect(item.passos[0]).toMatchObject({
      tipo: "insert",
      tabela: "pipeline_stages",
      linha: { pipeline_id: FUNIL, organization_id: ORG, position: 2, is_won: false },
    });
  });

  it("ganho e perdido não reordenam", async () => {
    await semearFunil();

    const estado = await moveStage(formulario({ id: "ganho", direction: "up" }));

    expect(estado.error).toMatch(/fim do funil/i);
    expect(await fila.fila.count()).toBe(0);
  });

  it("a reordenação leva só as etapas do meio", async () => {
    await semearFunil();

    await moveStage(formulario({ id: "e2", direction: "up" }));

    const [item] = await fila.fila.toArray();
    expect(item.passos[0]).toMatchObject({
      args: { p_tabela: "pipeline_stages", p_ids: ["e2", "e1"] },
    });
  });

  it("etapa com negócio dentro avisa antes de enfileirar", async () => {
    await semearFunil();
    await banco.tabela("opportunities").put({
      id: "o1",
      organization_id: ORG,
      person_id: "x",
      pipeline_id: FUNIL,
      stage_id: "e1",
      title: "Caso",
      updated_at: "2026-09-21T10:00:00Z",
    });

    const estado = await deleteStage(formulario({ id: "e1" }));

    expect(estado.error).toMatch(/1 negócio/);
    expect(await fila.fila.count()).toBe(0);
  });
});
