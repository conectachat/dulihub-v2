// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { buscarParecidos, CAMPO_CONFIRMAR_PARECIDO, type ContatoParecido } from "@/lib/parecidos";
import { contextoAtual } from "@/lib/organizacao";
import { createClient } from "@/lib/supabase/server";

import { gerarLink, marcarConferida, salvarCadastro } from "./actions";

/**
 * A ficha editada pela equipe, com o aviso de parecidos (CON-4). O banco é
 * falso: o que se prova é a decisão da ação — procurar ou não, ignorando o
 * próprio contato, e gravar ou não. A busca de verdade está em
 * `tests/rls/contatos.test.ts`.
 *
 * Revisão de 18/nov (4ª): a mesma lógica em `people/actions` tinha teste, e
 * esta não. Sem o `ignorar`, toda edição da ficha avisaria "já cadastrado em
 * ‹ele mesmo›" com a suíte verde.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

vi.mock("@/lib/organizacao", () => ({ contextoAtual: vi.fn() }));

// Parcial: `CAMPO_CONFIRMAR_PARECIDO` e `contatoMudou` continuam os de verdade.
vi.mock("@/lib/parecidos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/parecidos")>()),
  buscarParecidos: vi.fn(),
}));

const PARECIDO: ContatoParecido = {
  id: "p1",
  nome: "Carlos Souza",
  estagio: "client",
  naLixeira: false,
  bateEmail: false,
  bateTelefone: true,
};

/** O contato como está gravado hoje, e a gravação por `salvar_cadastro`. */
function bancoFalso() {
  const rpc = vi.fn(async () => ({ error: null }));
  const supabase = {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { email: "carla@example.com", phone_country_code: "+55", phone: "(31) 99999-0000" },
            error: null,
          }),
        }),
      }),
    })),
    rpc,
  };
  return { supabase, rpc };
}

function ficha(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries({
    full_name: "Carla Souza",
    email: "carla@example.com",
    phone_country_code: "+55",
    phone: "(31) 99999-0000",
    ...campos,
  })) {
    fd.set(chave, valor);
  }
  return fd;
}

let banco: ReturnType<typeof bancoFalso>;

beforeEach(() => {
  vi.clearAllMocks();
  banco = bancoFalso();
  vi.mocked(createClient).mockResolvedValue(banco.supabase as never);
  vi.mocked(buscarParecidos).mockResolvedValue({ parecidos: [PARECIDO], error: null });
});

describe("salvarCadastro", () => {
  it("sem mudar e-mail, DDI ou telefone, grava sem procurar parecidos", async () => {
    // O mesmo contato, redigitado: maiúscula e telefone sem máscara.
    const r = await salvarCadastro("p9", ficha({ email: "Carla@Example.com", phone: "31999990000" }));

    expect(buscarParecidos).not.toHaveBeenCalled();
    expect(banco.rpc).toHaveBeenCalledWith("salvar_cadastro", expect.objectContaining({ p_person: "p9" }));
    expect(r.error).toBeNull();
  });

  it("mudando o telefone, procura ignorando o próprio contato e não grava", async () => {
    const r = await salvarCadastro("p9", ficha({ phone: "31 88888-0000" }));

    expect(buscarParecidos).toHaveBeenCalledWith(
      banco.supabase,
      expect.objectContaining({ ignorar: "p9", telefone: "31 88888-0000" }),
    );
    expect(r.parecidos).toEqual([PARECIDO]);
    expect(r.error).toBeNull();
    expect(banco.rpc).not.toHaveBeenCalled();
  });

  it("com a confirmação, grava sem procurar", async () => {
    const r = await salvarCadastro(
      "p9",
      ficha({ phone: "31 88888-0000", [CAMPO_CONFIRMAR_PARECIDO]: "1" }),
    );

    expect(buscarParecidos).not.toHaveBeenCalled();
    expect(banco.rpc).toHaveBeenCalledTimes(1);
    expect(r.error).toBeNull();
  });
});

describe("gerarLink", () => {
  /**
   * O banco falso do link: a pessoa, o cancelamento (os filtros ficam
   * guardados) e o insert, com a resposta que o teste pedir.
   */
  function bancoDoLink(erroDoInsert: { code: string; message: string } | null = null) {
    const filtros: [string, unknown][] = [];
    const cancelamento = {
      eq: vi.fn((coluna: string, valor: unknown) => {
        filtros.push([coluna, valor]);
        return cancelamento;
      }),
      is: vi.fn((coluna: string, valor: unknown) => {
        filtros.push([coluna, valor]);
        return cancelamento;
      }),
      then: (resolver: (r: { error: null }) => unknown) => resolver({ error: null }),
    };
    const pessoa = {
      eq: () => pessoa,
      maybeSingle: async () => ({ data: { id: "p1", organization_id: "org" }, error: null }),
    };
    const supabase = {
      from: vi.fn((tabela: string) =>
        tabela === "people"
          ? { select: () => pessoa }
          : {
              update: vi.fn(() => cancelamento),
              insert: vi.fn(() => ({
                select: async () =>
                  erroDoInsert ? { data: null, error: erroDoInsert } : { data: [{ id: "l1" }], error: null },
              })),
            },
      ),
    };
    vi.mocked(contextoAtual).mockResolvedValue({
      supabase,
      userId: "u1",
      organizationId: "org",
      error: null,
    } as never);
    return filtros;
  }

  const formulario = () => {
    const fd = new FormData();
    fd.set("person_id", "p1");
    return fd;
  };

  it("cancela só a ficha comum aberta: nem a fechada, nem o link com a forma", async () => {
    const filtros = bancoDoLink();
    const r = await gerarLink(formulario());

    expect(r.ok).toBe(true);
    expect(filtros).toContainEqual(["person_id", "p1"]);
    expect(filtros).toContainEqual(["closed_at", null]);
    expect(filtros).toContainEqual(["cancelled_at", null]);
    expect(filtros).toContainEqual(["payment_plan_id", null]);
  });

  it("com o link com a forma aberto, a frase do banco volta como está (P7)", async () => {
    const frase = "Há um link da ficha aberto no negócio Contrato EB-2. Cancele-o no negócio antes.";
    bancoDoLink({ code: "P0001", message: frase });
    const r = await gerarLink(formulario());

    expect(r.error).toBe(frase);
  });
});

describe("marcarConferida", () => {
  /**
   * O banco falso do Conferi: a ficha escolhida e o update, com os filtros
   * guardados. Revisão final da 4b: o cliente que manda os dados duas vezes
   * antes do Conferi deixava a ficha mais antiga sem conferir, e o aviso da
   * Início preso, sem botão que o tirasse.
   */
  function bancoDoConferi() {
    const filtros: [string, string, unknown][] = [];
    const update = {
      eq: vi.fn((c: string, v: unknown) => (filtros.push(["eq", c, v]), update)),
      not: vi.fn((c: string, op: string, v: unknown) => (filtros.push(["not", c, `${op} ${String(v)}`]), update)),
      is: vi.fn((c: string, v: unknown) => (filtros.push(["is", c, v]), update)),
      lte: vi.fn((c: string, v: unknown) => (filtros.push(["lte", c, v]), update)),
      select: async () => ({ data: [{ person_id: "p1" }, { person_id: "p1" }], error: null }),
    };
    const escolhida = {
      eq: () => escolhida,
      not: () => escolhida,
      maybeSingle: async () => ({
        data: { person_id: "p1", submitted_at: "2026-10-15T10:00:00Z" },
        error: null,
      }),
    };
    const supabase = {
      from: vi.fn(() => ({ select: () => escolhida, update: vi.fn(() => update) })),
    };
    vi.mocked(contextoAtual).mockResolvedValue({
      supabase,
      userId: "u1",
      organizationId: "org",
      error: null,
    } as never);
    return filtros;
  }

  it("confere também as fichas recebidas antes dela, da mesma pessoa", async () => {
    const filtros = bancoDoConferi();
    const fd = new FormData();
    fd.set("id", "l2");

    const r = await marcarConferida(fd);

    expect(r.ok).toBe(true);
    expect(filtros).toContainEqual(["eq", "person_id", "p1"]);
    expect(filtros).toContainEqual(["is", "reviewed_at", null]);
    expect(filtros).toContainEqual(["lte", "submitted_at", "2026-10-15T10:00:00Z"]);
    expect(filtros).not.toContainEqual(["eq", "id", "l2"]);
  });
});
