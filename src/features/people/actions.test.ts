// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { contextoAtual } from "@/lib/organizacao";
import { buscarParecidos, CAMPO_CONFIRMAR_PARECIDO, type ContatoParecido } from "@/lib/parecidos";
import { createClient } from "@/lib/supabase/server";

import { createPerson, updatePerson } from "./actions";

/**
 * As ações de contato com o aviso de parecidos (CON-4). O primeiro teste de
 * Server Action da base: o banco é falso aqui — o que se prova é a decisão da
 * ação (procurar ou não, gravar ou não), e a busca de verdade tem a sua prova
 * em `tests/rls/contatos.test.ts`.
 */

// `revalidatePath` fora de uma requisição lança erro.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

vi.mock("@/lib/organizacao", () => ({
  contextoAtual: vi.fn(),
  SEM_ORGANIZACAO: "Sem organização.",
}));

// Parcial: `CAMPO_CONFIRMAR_PARECIDO` continua o de verdade.
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

const ESTADO = { error: null };

/** Um `people` falso: o que a linha tem hoje, e o que se pediu para gravar. */
function bancoFalso(atual: {
  email: string | null;
  phone_country_code: string | null;
  phone: string | null;
  partner_organization_id?: string | null;
}) {
  const insert = vi.fn(async () => ({ error: null }));
  const atualizado = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq: atualizado }));
  const supabase = {
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: atual, error: null }) }) }),
      insert,
      update,
    })),
  };
  return { supabase, insert, update };
}

function formulario(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries({
    full_name: "Carla Souza",
    email: "carla@example.com",
    phone_country_code: "+55",
    phone: "31 99999-0000",
    company: "",
    job_title: "",
    ...campos,
  })) {
    fd.set(chave, valor);
  }
  return fd;
}

let banco: ReturnType<typeof bancoFalso>;

beforeEach(() => {
  vi.clearAllMocks();
  banco = bancoFalso({ email: "carla@example.com", phone_country_code: "55", phone: "(31) 99999-0000" });
  vi.mocked(createClient).mockResolvedValue(banco.supabase as never);
  vi.mocked(contextoAtual).mockResolvedValue({
    supabase: banco.supabase,
    userId: "u1",
    organizationId: "o1",
    error: null,
  } as never);
  vi.mocked(buscarParecidos).mockResolvedValue({ parecidos: [PARECIDO], error: null });
});

describe("createPerson", () => {
  it("createPerson com parecido e sem confirmação não insere", async () => {
    const r = await createPerson(ESTADO, formulario({}));

    expect(r.parecidos).toEqual([PARECIDO]);
    expect(r.ok).toBeFalsy();
    expect(r.error).toBeNull();
    expect(banco.insert).not.toHaveBeenCalled();
  });

  it("com confirmação, insere", async () => {
    const r = await createPerson(ESTADO, formulario({ [CAMPO_CONFIRMAR_PARECIDO]: "1" }));

    expect(r.ok).toBe(true);
    expect(buscarParecidos).not.toHaveBeenCalled();
    expect(banco.insert).toHaveBeenCalledTimes(1);
  });

  it("sem parecido, insere sem perguntar", async () => {
    vi.mocked(buscarParecidos).mockResolvedValue({ parecidos: [], error: null });

    const r = await createPerson(ESTADO, formulario({}));

    expect(r.ok).toBe(true);
    expect(banco.insert).toHaveBeenCalledTimes(1);
  });
});

describe("updatePerson", () => {
  it("updatePerson sem mudar e-mail, DDI ou telefone não busca parecidos", async () => {
    // Mesmo contato, redigitado: maiúscula, DDI com o mais, telefone sem máscara.
    const r = await updatePerson(
      ESTADO,
      formulario({ id: "p9", email: "Carla@Example.com", phone: "31999990000" }),
    );

    expect(buscarParecidos).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    expect(banco.update).toHaveBeenCalledTimes(1);
  });

  it("mudando o telefone, busca com ignorar = id", async () => {
    const r = await updatePerson(ESTADO, formulario({ id: "p9", phone: "31 88888-0000" }));

    expect(buscarParecidos).toHaveBeenCalledWith(
      banco.supabase,
      expect.objectContaining({ ignorar: "p9", telefone: "31 88888-0000" }),
    );
    expect(r.parecidos).toEqual([PARECIDO]);
    expect(banco.update).not.toHaveBeenCalled();
  });
});

describe("updatePerson › cliente de parceiro (PAR-7, critério 9a)", () => {
  // O cliente de parceiro não tem contato próprio: o Editar da lista de
  // Contatos não o cobra, não procura parecido e não escreve as três colunas.
  // Quem decide é a linha da pessoa, nunca o formulário.
  it("grava o nome, sem contato e sem procurar parecido", async () => {
    banco = bancoFalso({ email: null, phone_country_code: null, phone: null, partner_organization_id: "thais" });
    vi.mocked(createClient).mockResolvedValue(banco.supabase as never);

    const r = await updatePerson(
      ESTADO,
      formulario({ id: "p9", full_name: "Fulano de Tal", email: "", phone_country_code: "", phone: "", company: "Acme" }),
    );

    expect(r.ok).toBe(true);
    expect(buscarParecidos).not.toHaveBeenCalled();
    expect(banco.update).toHaveBeenCalledWith({ full_name: "Fulano de Tal", company: "Acme", job_title: null });
  });
});
