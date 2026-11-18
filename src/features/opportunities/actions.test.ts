// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { contextoAtual } from "@/lib/organizacao";
import { CAMPO_CONFIRMAR_OPORTUNIDADE } from "@/lib/parecidos";

import { createOpportunity } from "./actions";

/**
 * `createOpportunity` monta a chamada de `criar_oportunidade` (0041) e traduz a
 * resposta. A função em si tem a sua prova contra o banco, em
 * `tests/rls/oportunidade-nova.test.ts`; aqui o banco é falso.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/organizacao", () => ({ contextoAtual: vi.fn() }));

const rpc = vi.fn();

function formulario(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries({
    stage_id: "11111111-1111-4111-8111-111111111111",
    title: " EB-2 NIW ",
    value: "",
    currency: "BRL",
    source: "",
    ...campos,
  })) {
    fd.set(chave, valor);
  }
  return fd;
}

const PESSOA = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(contextoAtual).mockResolvedValue({ supabase: { rpc }, error: null } as never);
});

describe("createOpportunity", () => {
  it("contato novo inválido não chama a função", async () => {
    const r = await createOpportunity(
      { error: null },
      formulario({
        modo_contato: "novo",
        novo_full_name: "Carla",
        novo_email: "",
        novo_phone_country_code: "+55",
        novo_phone: "31999990000",
      }),
    );

    expect(r.error).toBe("Informe o e-mail");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("contato existente com confirmação: manda o contato, o valor e a confirmação", async () => {
    rpc.mockResolvedValue({ data: { situacao: "criada", negocio: "n1", pessoa: PESSOA }, error: null });

    const r = await createOpportunity(
      { error: null },
      formulario({
        modo_contato: "existente",
        person_id: PESSOA,
        value: "1.500,00",
        currency: "USD",
        [CAMPO_CONFIRMAR_OPORTUNIDADE]: "1",
      }),
    );

    expect(r.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("criar_oportunidade", {
      p_etapa: "11111111-1111-4111-8111-111111111111",
      p_titulo: "EB-2 NIW",
      p_confirmar_contato_parecido: false,
      p_confirmar_outra_oportunidade: true,
      p_contato: PESSOA,
      p_valor: 1500,
      p_moeda: "USD",
    });
  });

  it("contato novo vai aparado e com o DDI com o mais", async () => {
    rpc.mockResolvedValue({ data: { situacao: "criada", negocio: "n1", pessoa: PESSOA }, error: null });

    await createOpportunity(
      { error: null },
      formulario({
        modo_contato: "novo",
        novo_full_name: " Carla Souza ",
        novo_email: " carla@example.com ",
        novo_phone_country_code: "55",
        novo_phone: "31 99999-0000",
      }),
    );

    expect(rpc.mock.calls[0][1].p_novo_contato).toEqual({
      full_name: "Carla Souza",
      email: "carla@example.com",
      phone_country_code: "+55",
      phone: "31 99999-0000",
    });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_contato");
  });

  it("precisa confirmar vira o aviso, sem ok", async () => {
    rpc.mockResolvedValue({
      data: {
        situacao: "precisa_confirmar",
        oportunidades: [
          { id: "n1", titulo: "EB-2 NIW", status: "won", criada_em: "2026-10-01T12:00:00+00:00" },
        ],
      },
      error: null,
    });

    const r = await createOpportunity(
      { error: null },
      formulario({ modo_contato: "existente", person_id: PESSOA }),
    );

    expect(r.ok).toBeFalsy();
    expect(r.error).toBeNull();
    expect(r.oportunidades).toEqual([
      { id: "n1", titulo: "EB-2 NIW", status: "won", criadaEm: "2026-10-01T12:00:00+00:00" },
    ]);
    expect(r.parecidos).toEqual([]);
  });

  it("recusa do banco chega com a frase dele", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "Este contato está na lixeira. Restaure antes." },
    });

    const r = await createOpportunity(
      { error: null },
      formulario({ modo_contato: "existente", person_id: PESSOA }),
    );

    expect(r.error).toBe("Este contato está na lixeira. Restaure antes.");
  });
});
