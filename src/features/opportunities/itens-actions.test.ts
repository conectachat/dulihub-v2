// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { contextoAtual } from "@/lib/organizacao";

import { adicionarItem, editarItem, removerItem } from "./itens-actions";

/**
 * Os vistos do negócio (CRM-13), gravados pela tela do lead.
 *
 * A organização vem **do negócio** e o nome **do visto**, lidos no servidor —
 * nunca do formulário: um campo forjado gravaria item na organização errada
 * ou com outro nome, e a linha seria válida. A posição é a última + 1.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/organizacao", () => ({ contextoAtual: vi.fn() }));

const NEGOCIO = "11111111-1111-4111-8111-111111111111";
const VISTO = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";

function bancoFalso(visto: { name: string; organization_id: string } | null = {
  name: "EB-1A",
  organization_id: "org-do-negocio",
}) {
  const insert = vi.fn(() => ({ select: async () => ({ data: [{ id: ITEM }], error: null }) }));
  const update = vi.fn(() => ({
    eq: () => ({ select: async () => ({ data: [{ opportunity_id: NEGOCIO }], error: null }) }),
  }));
  const remove = vi.fn(() => ({
    eq: () => ({ select: async () => ({ data: [{ opportunity_id: NEGOCIO }], error: null }) }),
  }));

  const umSo = (data: unknown) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) }),
  });

  const supabase = {
    from: vi.fn((tabela: string) => {
      if (tabela === "opportunities") return umSo({ organization_id: "org-do-negocio" });
      if (tabela === "visa_types") return umSo(visto);
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({ maybeSingle: async () => ({ data: { position: 1 }, error: null }) }),
            }),
          }),
        }),
        insert,
        update,
        delete: remove,
      };
    }),
  };
  return { supabase, insert, update, remove };
}

let banco: ReturnType<typeof bancoFalso>;

function usar(b: ReturnType<typeof bancoFalso>) {
  banco = b;
  vi.mocked(contextoAtual).mockResolvedValue({
    supabase: b.supabase,
    userId: "u1",
    organizationId: "org-de-quem-clicou",
    error: null,
  } as never);
}

function formulario(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

const VAZIO = { error: null };

beforeEach(() => {
  vi.clearAllMocks();
  usar(bancoFalso());
});

describe("adicionarItem", () => {
  it("grava com a organização do negócio e o nome do visto, na última posição", async () => {
    const r = await adicionarItem(
      VAZIO,
      formulario({
        opportunity_id: NEGOCIO,
        visa_type_id: VISTO,
        amount: "8.000",
        currency: "USD",
        // Forjados: o servidor não os lê.
        organization_id: "org-forjada",
        visa_name: "Nome forjado",
      }),
    );

    expect(r.error).toBeNull();
    expect(banco.insert).toHaveBeenCalledWith({
      organization_id: "org-do-negocio",
      opportunity_id: NEGOCIO,
      visa_type_id: VISTO,
      visa_name: "EB-1A",
      amount: 8000,
      currency: "USD",
      position: 2,
    });
  });

  it("sem valor, recusa sem gravar", async () => {
    const r = await adicionarItem(
      VAZIO,
      formulario({ opportunity_id: NEGOCIO, visa_type_id: VISTO, amount: "", currency: "BRL" }),
    );
    expect(r.error).toBe("Informe o valor.");
    expect(banco.insert).not.toHaveBeenCalled();
  });

  it("moeda fora de BRL e USD é recusada", async () => {
    const r = await adicionarItem(
      VAZIO,
      formulario({ opportunity_id: NEGOCIO, visa_type_id: VISTO, amount: "10", currency: "EUR" }),
    );
    expect(r.error).not.toBeNull();
    expect(banco.insert).not.toHaveBeenCalled();
  });

  it("visto de outra organização é recusado sem gravar", async () => {
    usar(bancoFalso({ name: "EB-1A", organization_id: "outra-org" }));
    const r = await adicionarItem(
      VAZIO,
      formulario({ opportunity_id: NEGOCIO, visa_type_id: VISTO, amount: "10", currency: "USD" }),
    );
    expect(r.error).toBe("Visto não encontrado.");
    expect(banco.insert).not.toHaveBeenCalled();
  });
});

describe("editarItem", () => {
  it("muda só o valor e a moeda", async () => {
    const r = await editarItem(
      VAZIO,
      formulario({ id: ITEM, amount: "6.500,50", currency: "BRL", visa_name: "Forjado" }),
    );
    expect(r.error).toBeNull();
    expect(banco.update).toHaveBeenCalledWith({ amount: 6500.5, currency: "BRL" });
  });

  it("sem valor, recusa sem gravar", async () => {
    const r = await editarItem(VAZIO, formulario({ id: ITEM, amount: "", currency: "BRL" }));
    expect(r.error).toBe("Informe o valor.");
    expect(banco.update).not.toHaveBeenCalled();
  });
});

describe("removerItem", () => {
  it("remove o item", async () => {
    const r = await removerItem(formulario({ id: ITEM }));
    expect(r?.error ?? null).toBeNull();
    expect(banco.remove).toHaveBeenCalled();
  });
});
