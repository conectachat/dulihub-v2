import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BancoLocal } from "@/lib/local/banco";
import { BancoDaFila } from "@/lib/local/banco-da-fila";
import { esquecerUsuarioLocal } from "@/lib/local/usuario";

/**
 * Criar cobrança no aparelho.
 *
 * O que mais importa aqui é a cobrança e as parcelas subirem **como um item
 * só**: se o cabeçalho for recusado, as parcelas não podem subir sozinhas —
 * ficariam penduradas numa cobrança que nunca existiu, e a fila as contaria
 * como aplicadas.
 */

const USUARIO = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const ERICK = "44444444-4444-4444-8444-444444444444";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: USUARIO } } } }) },
  }),
}));

vi.mock("@/lib/local/sincronizador", async (original) => ({
  ...(await original<typeof import("@/lib/local/sincronizador")>()),
  sincronizarAgora: vi.fn(),
}));

const { MARCA_DA_SINCRONIA } = await import("@/lib/local/sessao");
const { criarCobranca, darBaixa, desfazerBaixa, excluirCobranca, mudarVencimento } = await import(
  "./escritas-locais",
);
const { cobrancasDoContato, parcelasDoAparelho } = await import("./consultas-locais");

let banco: BancoLocal;
let fila: BancoDaFila;

function formulario(campos: Record<string, string>) {
  const dados = new FormData();
  for (const [k, v] of Object.entries(campos)) dados.set(k, v);
  return dados;
}

const base = {
  person_id: ERICK,
  title: "EB-1A — honorários",
  amount: "12.000,00",
  currency: "USD",
  quantidade: "4",
  primeiro_vencimento: "2026-11-05",
  method: "pix",
};

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
    updated_at: "2026-10-01T10:00:00Z",
  });
  await banco.tabela("organization_members").put({
    id: "m1",
    user_id: USUARIO,
    organization_id: ORG,
    role: "admin",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
  });
  await banco.marcas.put({ tabela: MARCA_DA_SINCRONIA, valor: new Date().toISOString() });
});

afterEach(async () => {
  banco.close();
  fila.close();
  await BancoLocal.delete(`dulihub-${USUARIO}`);
  await BancoDaFila.delete(`dulihub-fila-${USUARIO}`);
});

describe("criarCobranca", () => {
  it("a cobrança e as parcelas sobem como um item só", async () => {
    const estado = await criarCobranca({ error: null }, formulario(base));

    expect(estado.error).toBeNull();
    const [item] = await fila.fila.toArray();
    expect(item.passos).toHaveLength(5);
    expect(item.passos[0]).toMatchObject({
      tipo: "insert",
      tabela: "receivables",
      linha: { organization_id: ORG, person_id: ERICK, amount: 12000, currency: "USD" },
    });
    // Todas as parcelas apontam para a cobrança recém-criada.
    const idDaCobranca = item.alvo;
    for (const passo of item.passos.slice(1)) {
      expect(passo).toMatchObject({
        tipo: "insert",
        tabela: "installments",
        linha: { receivable_id: idDaCobranca },
      });
    }
  });

  it("o valor em português não vira cem vezes ele mesmo", async () => {
    const estado = await criarCobranca(
      { error: null },
      formulario({ ...base, amount: "2.000,00", quantidade: "1" }),
    );

    expect(estado.error).toBeNull();
    const [item] = await fila.fila.toArray();
    const passo = item.passos[0];
    if (passo.tipo !== "insert") throw new Error("O primeiro passo devia ser o insert.");
    expect(passo.linha.amount).toBe(2000);
  });

  it("entrada maior que o total é recusada antes de virar parcela", async () => {
    const estado = await criarCobranca(
      { error: null },
      formulario({ ...base, entrada: "20.000,00" }),
    );

    expect(estado.error).toMatch(/entrada/i);
    expect(await fila.fila.count()).toBe(0);
  });

  it("valor de tabela menor que o cobrado é recusado", async () => {
    const estado = await criarCobranca(
      { error: null },
      formulario({ ...base, list_amount: "1.000,00" }),
    );

    expect(estado.error).toMatch(/tabela/i);
    expect(await fila.fila.count()).toBe(0);
  });

  it("sem valor, não enfileira nada", async () => {
    const estado = await criarCobranca({ error: null }, formulario({ ...base, amount: "" }));

    expect(estado.error).toBeTruthy();
    expect(await fila.fila.count()).toBe(0);
  });

  it("aparelho parado há mais de sete dias não grava cobrança", async () => {
    const oito = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await banco.marcas.put({ tabela: MARCA_DA_SINCRONIA, valor: oito });

    const estado = await criarCobranca({ error: null }, formulario(base));

    expect(estado.error).toMatch(/sem sincronizar/i);
    expect(await fila.fila.count()).toBe(0);
  });
});

describe("excluirCobranca", () => {
  async function cobrancaComDuasParcelas() {
    await banco.tabela("receivables").put({
      id: "c1",
      organization_id: ORG,
      person_id: ERICK,
      title: "Antiga",
      amount: 1000,
      currency: "BRL",
      updated_at: "2026-10-01T10:00:00Z",
    });
    await banco.tabela("installments").bulkPut([
      { id: "p1", organization_id: ORG, receivable_id: "c1", number: 1, amount: 500, due_on: "2026-10-01", paid_on: null, method: "pix", updated_at: "2026-10-01T10:00:00Z" },
      { id: "p2", organization_id: ORG, receivable_id: "c1", number: 2, amount: 500, due_on: "2026-11-01", paid_on: null, method: "pix", updated_at: "2026-10-01T10:00:00Z" },
    ]);
  }

  it("manda só o delete da cobrança: as parcelas vão em cascata no servidor", async () => {
    // Desde a 0048, apagar direto uma parcela com anexo é recusado. Com um
    // delete por parcela, a recusa da segunda deixaria a cobrança pela
    // metade; com um delete só, a recusa vem inteira, como um conflito.
    await cobrancaComDuasParcelas();

    await excluirCobranca(formulario({ id: "c1", person_id: ERICK }));

    const [item] = await fila.fila.toArray();
    expect(item.passos).toEqual([{ tipo: "delete", tabela: "receivables", id: "c1" }]);
  });

  it("enquanto o delete não sobe, a cobrança e as parcelas somem da tela", async () => {
    // O Dexie não apaga as filhas sozinho: quem as esconde é a leitura, que
    // descarta parcela sem cobrança.
    await cobrancaComDuasParcelas();

    await excluirCobranca(formulario({ id: "c1", person_id: ERICK }));

    expect(await cobrancasDoContato(banco, fila, ERICK, "2026-11-18")).toEqual([]);
    expect(await parcelasDoAparelho(banco, fila)).toEqual([]);
  });
});

describe("dar baixa", () => {
  // Id de verdade: os ids da fila são gerados por `novoId()`, e o schema
  // recusa qualquer coisa que não seja um uuid.
  const PARCELA = "55555555-5555-4555-8555-555555555555";

  beforeEach(async () => {
    await banco.tabela("receivables").put({
      id: "c1",
      organization_id: ORG,
      person_id: ERICK,
      title: "EB-1A",
      amount: 1000,
      currency: "USD",
      updated_at: "2026-10-01T10:00:00Z",
    });
    await banco.tabela("installments").put({
      id: PARCELA,
      organization_id: ORG,
      receivable_id: "c1",
      number: 1,
      amount: 1000,
      due_on: "2026-10-01",
      paid_on: null,
      paid_rate: null,
      method: "pix",
      updated_at: "2026-10-01T10:00:00Z",
    });
  });

  it("grava a data e a cotação daquele dia", async () => {
    await darBaixa(
      { error: null },
      formulario({ id: PARCELA, paid_on: "2026-10-03", paid_rate: "5,42", moeda: "USD" }),
    );

    const [item] = await fila.fila.toArray();
    expect(item.passos[0]).toMatchObject({
      tipo: "update",
      tabela: "installments",
      id: PARCELA,
      patch: { paid_on: "2026-10-03", paid_rate: 5.42 },
    });
  });

  it("cotação com três casas é lida como cotação, não como milhar", async () => {
    // "5,425" pela regra do dinheiro virava 5425, e US$ 1.000 entrava no
    // fechamento do mês como R$ 5.425.000.
    await darBaixa(
      { error: null },
      formulario({ id: PARCELA, paid_on: "2026-10-03", paid_rate: "5,425", moeda: "USD" }),
    );

    const [item] = await fila.fila.toArray();
    expect(item.passos[0]).toMatchObject({ patch: { paid_rate: 5.425 } });
  });

  it("cotação fora do normal é recusada", async () => {
    const estado = await darBaixa(
      { error: null },
      formulario({ id: PARCELA, paid_on: "2026-10-03", paid_rate: "5425", moeda: "USD" }),
    );

    expect(estado.error).toMatch(/fora do normal/i);
    expect(await fila.fila.count()).toBe(0);
  });

  it("em dólar sem cotação, grava a baixa só com a data", async () => {
    // O dinheiro fica em dólar (Nomad, C6 Global, Binance) e é convertido
    // depois, juntando vários: não há cotação do dia (Renato, 24/nov). A
    // parcela fica paga em US$ e fora do recebido em reais.
    const estado = await darBaixa(
      { error: null },
      formulario({ id: PARCELA, paid_on: "2026-10-03", paid_rate: "", moeda: "USD" }),
    );

    expect(estado.error).toBeNull();
    const [item] = await fila.fila.toArray();
    expect(item.passos[0]).toMatchObject({ patch: { paid_on: "2026-10-03", paid_rate: null } });
  });

  it("cotação zero é recusada — o banco também recusa", async () => {
    const estado = await darBaixa(
      { error: null },
      formulario({ id: PARCELA, paid_on: "2026-10-03", paid_rate: "0", moeda: "USD" }),
    );

    expect(estado.error).toBe("Cotação fora do normal — confira (ex.: 5,42)");
    expect(await fila.fila.count()).toBe(0);
  });

  it("em real, a cotação vai nula — o banco recusa cotação sem sentido", async () => {
    const estado = await darBaixa(
      { error: null },
      formulario({ id: PARCELA, paid_on: "2026-10-03", moeda: "BRL" }),
    );

    expect(estado.error).toBeNull();
    const [item] = await fila.fila.toArray();
    expect(item.passos[0]).toMatchObject({ patch: { paid_on: "2026-10-03", paid_rate: null } });
  });

  it("desfazer a baixa limpa data e cotação juntas", async () => {
    await desfazerBaixa(formulario({ id: PARCELA }));

    const [item] = await fila.fila.toArray();
    expect(item.passos[0]).toMatchObject({
      patch: { paid_on: null, paid_rate: null },
    });
  });
});

describe("mudar o vencimento", () => {
  // O cliente combina pagar depois (Renato, 24/nov): a parcela não pode ficar
  // atrasada, e o histórico guarda a data de antes.
  const PARCELA = "66666666-6666-4666-8666-666666666666";

  beforeEach(async () => {
    await banco.tabela("receivables").put({
      id: "c1",
      organization_id: ORG,
      person_id: ERICK,
      title: "EB-1A",
      amount: 1000,
      currency: "USD",
      updated_at: "2026-10-01T10:00:00Z",
    });
    await banco.tabela("installments").put({
      id: PARCELA,
      organization_id: ORG,
      receivable_id: "c1",
      number: 1,
      amount: 1000,
      due_on: "2026-10-01",
      paid_on: null,
      paid_rate: null,
      method: "pix",
      updated_at: "2026-10-01T10:00:00Z",
    });
  });

  it("muda a data e escreve o histórico, no mesmo item da fila", async () => {
    const estado = await mudarVencimento({ error: null }, formulario({ id: PARCELA, due_on: "2026-10-08" }));

    expect(estado.error).toBeNull();
    const [item] = await fila.fila.toArray();
    expect(item.alvo).toBe(PARCELA);
    expect(item.rotulo).toBe("Mudar o vencimento da parcela 1 para 08/10/2026");
    expect(item.passos).toHaveLength(2);
    expect(item.passos[0]).toEqual({
      tipo: "update",
      tabela: "installments",
      id: PARCELA,
      patch: { due_on: "2026-10-08" },
    });
    expect(item.passos[1]).toMatchObject({
      tipo: "insert",
      tabela: "activities",
      linha: {
        organization_id: ORG,
        person_id: ERICK,
        type: "vencimento_alterado",
        description: "Vencimento da parcela 1 de EB-1A mudado de 01/10/2026 para 08/10/2026",
        created_by: USUARIO,
      },
    });
  });

  it("parcela paga não muda de vencimento", async () => {
    await banco.tabela("installments").put({
      id: PARCELA,
      organization_id: ORG,
      receivable_id: "c1",
      number: 1,
      amount: 1000,
      due_on: "2026-10-01",
      paid_on: "2026-10-01",
      paid_rate: null,
      method: "pix",
      updated_at: "2026-10-02T10:00:00Z",
    });

    const estado = await mudarVencimento({ error: null }, formulario({ id: PARCELA, due_on: "2026-10-08" }));

    expect(estado.error).toBe("Parcela paga não muda de vencimento.");
    expect(await fila.fila.count()).toBe(0);
  });

  it("a mesma data não grava nada nem escreve histórico", async () => {
    const estado = await mudarVencimento({ error: null }, formulario({ id: PARCELA, due_on: "2026-10-01" }));

    expect(estado.error).toBeNull();
    expect(await fila.fila.count()).toBe(0);
  });

  it("parcela que o aparelho não tem é recusada", async () => {
    const estado = await mudarVencimento(
      { error: null },
      formulario({ id: "77777777-7777-4777-8777-777777777777", due_on: "2026-10-08" }),
    );

    expect(estado.error).toBe("Parcela não encontrada neste aparelho.");
    expect(await fila.fila.count()).toBe(0);
  });
});
