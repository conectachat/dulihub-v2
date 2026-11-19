// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { buscarParecidos, type ContatoParecido } from "@/lib/parecidos";
import { createClient } from "@/lib/supabase/server";

import { atualizarCliente, marcarComoCliente } from "./actions";

/**
 * Editar o cliente (CLI-10, CLI-12) e marcá-lo como cliente à mão (CLI-11).
 *
 * O banco é falso aqui: o que se prova é o pedido. A regra de quem pode — só
 * a gestão marca, cliente não volta — está no banco e tem a sua prova em
 * `tests/rls/estagio-do-cliente.test.ts`.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((destino: string) => {
    throw new Error(`NEXT_REDIRECT ${destino}`);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/parecidos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/parecidos")>()),
  buscarParecidos: vi.fn(),
}));

const PARECIDO: ContatoParecido = {
  id: "p2",
  nome: "Carla Souza",
  estagio: "client",
  naLixeira: false,
  bateEmail: true,
  bateTelefone: false,
};

const ATUAL = {
  organization_id: "org-da-pessoa",
  email: "carla@example.com",
  phone_country_code: "+55",
  phone: "31999990000",
};

/** `people` e `person_participants` falsos, guardando o que se pediu. */
function bancoFalso(participantesAtuais: string[]) {
  const atualizado = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq: atualizado }));
  const insert = vi.fn(async () => ({ error: null }));
  const apagadoIn = vi.fn(async () => ({ error: null }));
  const del = vi.fn(() => ({ eq: () => ({ in: apagadoIn }) }));
  const rpc = vi.fn(async () => ({ error: null }));

  const supabase = {
    rpc,
    from: vi.fn((tabela: string) =>
      tabela === "people"
        ? {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ATUAL, error: null }) }) }),
            update,
          }
        : {
            select: () => ({
              eq: async () => ({
                data: participantesAtuais.map((user_id) => ({ user_id })),
                error: null,
              }),
            }),
            insert,
            delete: del,
          },
    ),
  };
  return { supabase, update, insert, del, apagadoIn, rpc };
}

function formulario(campos: Record<string, string>, participantes: string[] = []) {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries({
    id: "p1",
    full_name: "Carla Souza",
    email: "carla@example.com",
    phone_country_code: "+55",
    phone: "31999990000",
    company: "",
    job_title: "",
    owner_id: "u1",
    client_since: "2026-03-01",
    ...campos,
  })) {
    fd.set(chave, valor);
  }
  for (const p of participantes) fd.append("participantes", p);
  return fd;
}

const ESTADO = { error: null };
let banco: ReturnType<typeof bancoFalso>;

beforeEach(() => {
  vi.clearAllMocks();
  banco = bancoFalso(["u2", "u3"]);
  vi.mocked(createClient).mockResolvedValue(banco.supabase as never);
  vi.mocked(buscarParecidos).mockResolvedValue({ parecidos: [], error: null });
});

describe("atualizarCliente", () => {
  it("grava os campos do contato, o dono e o cliente desde", async () => {
    const r = await atualizarCliente(ESTADO, formulario({}, ["u2", "u3"]));

    expect(r.error).toBeNull();
    expect(banco.update).toHaveBeenCalledWith({
      full_name: "Carla Souza",
      email: "carla@example.com",
      phone_country_code: "+55",
      phone: "31999990000",
      company: null,
      job_title: null,
      owner_id: "u1",
      client_since: "2026-03-01",
    });
  });

  it("sem dono e sem data, grava nulo", async () => {
    await atualizarCliente(ESTADO, formulario({ owner_id: "", client_since: "" }, ["u2", "u3"]));

    expect(banco.update).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: null, client_since: null }),
    );
  });

  it("participantes: entra quem é novo, sai quem foi tirado, na organização da pessoa", async () => {
    await atualizarCliente(ESTADO, formulario({}, ["u3", "u4"]));

    expect(banco.insert).toHaveBeenCalledWith([
      { organization_id: "org-da-pessoa", person_id: "p1", user_id: "u4" },
    ]);
    expect(banco.apagadoIn).toHaveBeenCalledWith("user_id", ["u2"]);
  });

  it("participantes iguais: nem insere nem apaga", async () => {
    await atualizarCliente(ESTADO, formulario({}, ["u3", "u2"]));

    expect(banco.insert).not.toHaveBeenCalled();
    expect(banco.del).not.toHaveBeenCalled();
  });

  it("e-mail trocado para um que já existe pergunta antes, como no contato", async () => {
    vi.mocked(buscarParecidos).mockResolvedValue({ parecidos: [PARECIDO], error: null });

    const r = await atualizarCliente(ESTADO, formulario({ email: "outra@example.com" }));

    expect(r.parecidos).toEqual([PARECIDO]);
    expect(banco.update).not.toHaveBeenCalled();
  });

  it("cliente desde no futuro é recusado", async () => {
    const r = await atualizarCliente(ESTADO, formulario({ client_since: "2999-01-01" }));

    expect(r.error).toBe("A data de cliente não pode ser no futuro.");
    expect(banco.update).not.toHaveBeenCalled();
  });
});

describe("marcarComoCliente", () => {
  it("chama a função do banco com a data e leva ao perfil de cliente", async () => {
    const fd = new FormData();
    fd.set("id", "p1");
    fd.set("desde", "2026-11-01");

    await expect(marcarComoCliente(ESTADO, fd)).rejects.toThrow("NEXT_REDIRECT /clientes/p1");
    expect(banco.rpc).toHaveBeenCalledWith("marcar_como_cliente", {
      p_pessoa: "p1",
      p_desde: "2026-11-01",
    });
  });

  it("a recusa do banco volta com a frase dele", async () => {
    banco.rpc.mockResolvedValue({
      error: { code: "P0001", message: "Só a gestão marca alguém como cliente." },
    } as never);
    const fd = new FormData();
    fd.set("id", "p1");
    fd.set("desde", "2026-11-01");

    const r = await marcarComoCliente(ESTADO, fd);

    expect(r.error).toBe("Só a gestão marca alguém como cliente.");
  });
});
