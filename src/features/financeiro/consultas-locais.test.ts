import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BancoLocal } from "@/lib/local/banco";
import { BancoDaFila } from "@/lib/local/banco-da-fila";

import { cobrancasDoContato, parcelasDoAparelho } from "./consultas-locais";

/**
 * O a receber lido do aparelho.
 *
 * Prova as duas coisas que esta camada existe para garantir: que os totais
 * saem das parcelas (e não de coluna guardada), e que o que está na fila
 * aparece junto do que já subiu — sem duplicar.
 */

const USUARIO = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const ERICK = "44444444-4444-4444-8444-444444444444";
const HOJE = "2026-10-15";

let banco: BancoLocal;
let fila: BancoDaFila;

beforeEach(async () => {
  banco = new BancoLocal(USUARIO);
  await banco.open();
  fila = new BancoDaFila(USUARIO);
  await fila.open();

  await banco.tabela("people").put({
    id: ERICK,
    organization_id: ORG,
    full_name: "Erick de Teste",
    updated_at: "2026-10-01T10:00:00Z",
  });
  await banco.tabela("receivables").put({
    id: "c1",
    organization_id: ORG,
    person_id: ERICK,
    project_id: null,
    title: "EB-1A — honorários",
    amount: 12000,
    list_amount: null,
    currency: "USD",
    notes: null,
    updated_at: "2026-10-01T10:00:00Z",
  });
  await banco.tabela("installments").bulkPut([
    { id: "p1", organization_id: ORG, receivable_id: "c1", number: 1, amount: 6000, due_on: "2026-09-10", paid_on: "2026-09-10", paid_rate: 5.4, method: "pix", notes: null, updated_at: "2026-10-01T10:00:00Z" },
    { id: "p2", organization_id: ORG, receivable_id: "c1", number: 2, amount: 6000, due_on: "2026-10-10", paid_on: null, paid_rate: null, method: "pix", notes: null, updated_at: "2026-10-01T10:00:00Z" },
  ]);
});

afterEach(async () => {
  banco.close();
  fila.close();
  await BancoLocal.delete(`dulihub-${USUARIO}`);
  await BancoDaFila.delete(`dulihub-fila-${USUARIO}`);
});

describe("cobrancasDoContato", () => {
  it("traz as parcelas em ordem e soma o resumo delas", async () => {
    const [cobranca] = await cobrancasDoContato(banco, fila, ERICK, HOJE);

    expect(cobranca.title).toBe("EB-1A — honorários");
    expect(cobranca.currency).toBe("USD");
    expect(cobranca.parcelas.map((p) => p.number)).toEqual([1, 2]);
    expect(cobranca.resumo).toEqual({
      total: 12000,
      pago: 6000,
      aberto: 6000,
      vencido: 6000,
      parcelas: 2,
      pagas: 1,
    });
  });

  it("cobrança de outro cliente não entra", async () => {
    await banco.tabela("receivables").put({
      id: "c2",
      organization_id: ORG,
      person_id: "outro",
      title: "De outro",
      amount: 10,
      currency: "BRL",
      updated_at: "2026-10-01T10:00:00Z",
    });

    const lista = await cobrancasDoContato(banco, fila, ERICK, HOJE);

    expect(lista.map((c) => c.id)).toEqual(["c1"]);
  });

  it("cobrança criada offline aparece marcada, com as parcelas dela", async () => {
    await fila.fila.put({
      id: "f1",
      alvo: "c9",
      depende: [],
      passos: [
        {
          tipo: "insert",
          tabela: "receivables",
          linha: {
            id: "c9",
            organization_id: ORG,
            person_id: ERICK,
            title: "Tradução",
            amount: 800,
            currency: "BRL",
          },
        },
        {
          tipo: "insert",
          tabela: "installments",
          linha: {
            id: "p9",
            organization_id: ORG,
            receivable_id: "c9",
            number: 1,
            amount: 800,
            due_on: "2026-11-01",
            method: "pix",
          },
        },
      ],
      rotulo: "Criar a cobrança Tradução",
      criada_em: "2026-10-15T10:00:00Z",
      estado: "pendente",
      enviada_em: null,
      motivo: null,
    });

    const lista = await cobrancasDoContato(banco, fila, ERICK, HOJE);
    const nova = lista.find((c) => c.id === "c9")!;

    expect(nova.pendente).toBe(true);
    expect(nova.parcelas).toHaveLength(1);
    expect(nova.parcelas[0].pendente).toBe(true);
    expect(nova.resumo.aberto).toBe(800);
  });

  it("baixa feita offline já conta como paga", async () => {
    await fila.fila.put({
      id: "f2",
      alvo: "p2",
      depende: [],
      passos: [
        {
          tipo: "update",
          tabela: "installments",
          id: "p2",
          patch: { paid_on: "2026-10-12", paid_rate: 5.5 },
        },
      ],
      rotulo: "Dar baixa",
      criada_em: "2026-10-15T10:00:00Z",
      estado: "pendente",
      enviada_em: null,
      motivo: null,
    });

    const [cobranca] = await cobrancasDoContato(banco, fila, ERICK, HOJE);

    expect(cobranca.resumo.pago).toBe(12000);
    expect(cobranca.resumo.aberto).toBe(0);
    expect(cobranca.resumo.vencido).toBe(0);
  });
});

describe("parcelasDoAparelho", () => {
  it("lista por vencimento, com cliente e moeda ao lado", async () => {
    const lista = await parcelasDoAparelho(banco, fila);

    expect(lista.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(lista[0].cliente).toBe("Erick de Teste");
    expect(lista[0].currency).toBe("USD");
    expect(lista[0].cobranca).toBe("EB-1A — honorários");
  });

  it("parcela sem o cabeçalho no aparelho não vira linha sem moeda", async () => {
    // O espelho pode trazer a parcela antes da cobrança. Mostrar sem moeda
    // nem cliente é pior do que não mostrar.
    await banco.tabela("installments").put({
      id: "solta",
      organization_id: ORG,
      receivable_id: "nao-veio",
      number: 1,
      amount: 100,
      due_on: "2026-10-20",
      paid_on: null,
      method: "pix",
      updated_at: "2026-10-01T10:00:00Z",
    });

    const lista = await parcelasDoAparelho(banco, fila);

    expect(lista.map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});
