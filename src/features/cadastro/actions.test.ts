// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { buscarParecidos, CAMPO_CONFIRMAR_PARECIDO, type ContatoParecido } from "@/lib/parecidos";
import { createClient } from "@/lib/supabase/server";

import { salvarCadastro } from "./actions";

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
