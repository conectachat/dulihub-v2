// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { redirect } from "next/navigation";

import { contextoAtual } from "@/lib/organizacao";
import { CAMPO_CONFIRMAR_OPORTUNIDADE } from "@/lib/parecidos";

import {
  createOpportunity,
  deleteOpportunity,
  ganharOportunidade,
  reabrirOportunidade,
  resumoDoGanho,
  updateOpportunity,
} from "./actions";

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

  it("contato existente com confirmação: manda o contato e a confirmação — e nunca o valor (D11)", async () => {
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

const NEGOCIO = "33333333-3333-4333-8333-333333333333";

const RESUMO = {
  negocio: NEGOCIO,
  pessoa: { id: PESSOA, nome: "Maria Souza", vira_cliente: true },
  itens: [{ id: "i1", visa_name: "EB-1A", amount: 8000, currency: "USD" }],
  processos: [{ item: "i1", titulo: "EB-1A — Maria Souza", id: null }],
  cobrancas: [],
  avisos: [],
};

const comId = (id: string) => {
  const fd = new FormData();
  fd.set("id", id);
  return fd;
};

describe("resumoDoGanho", () => {
  it("simula o Ganho e devolve o resumo lido", async () => {
    rpc.mockResolvedValue({ data: RESUMO, error: null });

    const { resumo, error } = await resumoDoGanho(NEGOCIO);

    expect(rpc).toHaveBeenCalledWith("ganhar_negocio", { p_negocio: NEGOCIO, p_simular: true });
    expect(error).toBeNull();
    expect(resumo?.processos[0]?.titulo).toBe("EB-1A — Maria Souza");
  });

  it("devolve a frase do banco quando o Ganho seria recusado", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "Acrescente pelo menos um visto antes do Ganho." },
    });

    const { resumo, error } = await resumoDoGanho(NEGOCIO);

    expect(resumo).toBeNull();
    expect(error).toBe("Acrescente pelo menos um visto antes do Ganho.");
  });

  it("formato inesperado não vira resumo", async () => {
    rpc.mockResolvedValue({ data: { negocio: NEGOCIO }, error: null });
    const { resumo, error } = await resumoDoGanho(NEGOCIO);
    expect(resumo).toBeNull();
    expect(error).not.toBeNull();
  });
});

describe("ganharOportunidade", () => {
  it("ganha pela função e segue para a aba Projetos do cliente", async () => {
    rpc.mockResolvedValue({
      data: { ...RESUMO, processos: [{ ...RESUMO.processos[0], id: "p1" }] },
      error: null,
    });

    await ganharOportunidade(comId(NEGOCIO));

    expect(rpc).toHaveBeenCalledWith("ganhar_negocio", { p_negocio: NEGOCIO });
    expect(redirect).toHaveBeenCalledWith(`/clientes/${PESSOA}?aba=projetos`);
  });

  it("recusa do banco volta como frase, sem redirecionar", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "Só o dono do negócio ou a gestão ganham o negócio." },
    });

    const estado = await ganharOportunidade(comId(NEGOCIO));

    expect(estado.error).toBe("Só o dono do negócio ou a gestão ganham o negócio.");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("reabrirOportunidade", () => {
  it("reabre pela função", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    const estado = await reabrirOportunidade(comId(NEGOCIO));

    expect(rpc).toHaveBeenCalledWith("reabrir_negocio", { p_negocio: NEGOCIO });
    expect(estado.error).toBeNull();
    expect(estado.ok).toBe(true);
  });

  it("recusa do banco volta como frase", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "Só o dono do negócio ou a gestão reabrem o negócio." },
    });

    const estado = await reabrirOportunidade(comId(NEGOCIO));

    expect(estado.error).toBe("Só o dono do negócio ou a gestão reabrem o negócio.");
  });
});

describe("deleteOpportunity", () => {
  /** O banco falso: o delete devolve o que a RLS e o filtro deixariam apagar. */
  function banco(apagadas: { id: string }[], statusQueSobrou: string | null) {
    const neq = vi.fn(() => ({ select: async () => ({ data: apagadas, error: null }) }));
    const supabase = {
      from: vi.fn(() => ({
        delete: () => ({ eq: () => ({ neq }) }),
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: statusQueSobrou ? { status: statusQueSobrou } : null,
              error: null,
            }),
          }),
        }),
      })),
    };
    vi.mocked(contextoAtual).mockResolvedValue({ supabase, error: null } as never);
    return { neq };
  }

  it("negócio ganho não se exclui: fica como registro (D12)", async () => {
    const { neq } = banco([], "won");

    const estado = await deleteOpportunity(comId(NEGOCIO));

    expect(neq).toHaveBeenCalledWith("status", "won");
    expect(estado.error).toBe("Reabra ou encerre os processos; o negócio ganho fica como registro.");
  });

  it("negócio aberto se exclui", async () => {
    banco([{ id: NEGOCIO }], null);
    const estado = await deleteOpportunity(comId(NEGOCIO));
    expect(estado.error).toBeNull();
  });
});

describe("updateOpportunity: dono e participantes do negócio", () => {
  /** `opportunities` e `opportunity_participants` falsos, guardando o pedido. */
  function banco(
    participantesAtuais: string[],
    erroDoUpdate: { code: string; message: string } | null = null,
  ) {
    const update = vi.fn(() => ({
      eq: () => ({
        select: async () => ({
          data: erroDoUpdate ? null : [{ person_id: PESSOA, organization_id: "org-do-negocio" }],
          error: erroDoUpdate,
        }),
      }),
    }));
    const insert = vi.fn(async () => ({ error: null }));
    const apagadoIn = vi.fn(async () => ({ error: null }));
    const supabase = {
      from: vi.fn((tabela: string) =>
        tabela === "opportunities"
          ? { update }
          : {
              select: () => ({
                eq: async () => ({
                  data: participantesAtuais.map((user_id) => ({ user_id })),
                  error: null,
                }),
              }),
              insert,
              delete: () => ({ eq: () => ({ in: apagadoIn }) }),
            },
      ),
    };
    vi.mocked(contextoAtual).mockResolvedValue({ supabase, error: null } as never);
    return { update, insert, apagadoIn };
  }

  function edicao(campos: Record<string, string>, participantes: string[]) {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ id: NEGOCIO, title: " EB-1A ", source: "", ...campos })) {
      fd.set(k, v);
    }
    for (const u of participantes) fd.append("participantes", u);
    return fd;
  }

  const U1 = "a1111111-1111-4111-8111-111111111111";
  const U2 = "a2222222-2222-4222-8222-222222222222";
  const U3 = "a3333333-3333-4333-8333-333333333333";

  it("grava o dono e só a diferença dos participantes, na organização do negócio", async () => {
    const b = banco([U1, U2]);

    const estado = await updateOpportunity({ error: null }, edicao({ owner_id: U2 }, [U2, U3]));

    expect(estado.error).toBeNull();
    expect(b.update).toHaveBeenCalledWith({ title: "EB-1A", source: null, owner_id: U2 });
    expect(b.insert).toHaveBeenCalledWith([
      { organization_id: "org-do-negocio", opportunity_id: NEGOCIO, user_id: U3 },
    ]);
    expect(b.apagadoIn).toHaveBeenCalledWith("user_id", [U1]);
  });

  it("sem dono escolhido, grava sem dono", async () => {
    const b = banco([]);
    await updateOpportunity({ error: null }, edicao({ owner_id: "" }, []));
    expect(b.update).toHaveBeenCalledWith({ title: "EB-1A", source: null, owner_id: null });
  });

  it("troca de dono recusada pelo banco volta como frase, e os participantes ficam", async () => {
    const b = banco([U1], {
      code: "P0001",
      message: "Só o dono do negócio ou a gestão trocam o dono.",
    });

    const estado = await updateOpportunity({ error: null }, edicao({ owner_id: U2 }, [U2]));

    expect(estado.error).toBe("Só o dono do negócio ou a gestão trocam o dono.");
    expect(b.insert).not.toHaveBeenCalled();
  });
});
