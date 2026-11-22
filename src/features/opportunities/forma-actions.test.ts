// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";

import { ESTADO_INICIAL } from "@/lib/action-state";
import { contextoAtual } from "@/lib/organizacao";
import { revalidarPessoa } from "@/lib/revalidar";

import {
  confirmarFormaPelaEquipe,
  refazerFormaDePagamento,
  salvarCotacao,
  salvarFormaDePagamento,
} from "./forma-actions";
import { erroDaParte, type ParteDaForma } from "./forma-regras";

/**
 * As ações da forma de pagamento (entrega 4a). O banco é falso: o que se prova
 * é que a forma inválida não sai do servidor (a mesma primeira frase da
 * janela), que a válida vai inteira à função da 0058, e que a frase do banco
 * volta como está. As recusas de verdade têm a sua prova em
 * `tests/rls/forma-de-pagamento.test.ts`.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/organizacao", () => ({ contextoAtual: vi.fn() }));
vi.mock("@/lib/revalidar", () => ({ revalidarPessoa: vi.fn() }));

const NEGOCIO = "11111111-1111-4111-8111-111111111111";
const PESSOA = "22222222-2222-4222-8222-222222222222";
const PLANO = "33333333-3333-4333-8333-333333333333";

const ENTRADA: ParteDaForma = {
  label: "Entrada",
  method: "pix",
  currency: "BRL",
  total: 10000,
  installments_count: 1,
  parcelas: [{ number: 1, amount: 10000, due_on: "2026-12-10" }],
};

type RespostaDoBanco = { data: unknown; error: { code?: string; message?: string } | null };

function bancoFalso(respostaDoRpc: RespostaDoBanco = { data: PLANO, error: null }) {
  const rpc = vi.fn<(funcao: string, argumentos: Record<string, unknown>) => Promise<RespostaDoBanco>>(
    async () => respostaDoRpc,
  );
  const select = vi.fn(async () => ({ data: [{ id: PLANO }], error: null }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn<(campos: Record<string, unknown>) => { eq: typeof eq }>(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { supabase: { rpc, from }, rpc, from, update, eq };
}

let banco: ReturnType<typeof bancoFalso>;

function usar(b: ReturnType<typeof bancoFalso>) {
  banco = b;
  vi.mocked(contextoAtual).mockResolvedValue({
    supabase: b.supabase,
    userId: "u1",
    organizationId: "org",
    error: null,
  } as never);
}

function formulario(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  usar(bancoFalso());
});

describe("salvarFormaDePagamento", () => {
  it("forma com a soma errada não chama o banco e devolve a frase da janela", async () => {
    const errada = { ...ENTRADA, parcelas: [{ number: 1, amount: 9999.99, due_on: "2026-12-10" }] };

    const r = await salvarFormaDePagamento(
      ESTADO_INICIAL,
      formulario({ negocio: NEGOCIO, forma: JSON.stringify({ partes: [errada] }) }),
    );

    expect(banco.rpc).not.toHaveBeenCalled();
    expect(r.ok).toBeFalsy();
    expect(r.error).toContain("As parcelas de Entrada somam");
    expect(r.error).toBe(erroDaParte(errada));
  });

  it("forma válida vai inteira a salvar_forma_de_pagamento e revalida o lead", async () => {
    const r = await salvarFormaDePagamento(
      ESTADO_INICIAL,
      formulario({ negocio: NEGOCIO, forma: JSON.stringify({ partes: [ENTRADA] }) }),
    );

    expect(banco.rpc).toHaveBeenCalledWith("salvar_forma_de_pagamento", {
      p_negocio: NEGOCIO,
      p_forma: { partes: [ENTRADA] },
    });
    expect(r.ok).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith(`/crm/${NEGOCIO}`);
  });

  it("a frase do banco (P0001) volta como está", async () => {
    usar(
      bancoFalso({
        data: null,
        error: { code: "P0001", message: "A forma está confirmada. Use Refazer para mudar." },
      }),
    );

    const r = await salvarFormaDePagamento(
      ESTADO_INICIAL,
      formulario({ negocio: NEGOCIO, forma: JSON.stringify({ partes: [ENTRADA] }) }),
    );

    expect(r.error).toBe("A forma está confirmada. Use Refazer para mudar.");
  });

  it("forma que não é JSON não chama o banco", async () => {
    const r = await salvarFormaDePagamento(
      ESTADO_INICIAL,
      formulario({ negocio: NEGOCIO, forma: "{partes" }),
    );

    expect(banco.rpc).not.toHaveBeenCalled();
    expect(r.error).toBe("A forma de pagamento veio num formato inválido.");
  });

  it("sem negócio não chama o banco", async () => {
    const r = await salvarFormaDePagamento(
      ESTADO_INICIAL,
      formulario({ negocio: "x", forma: JSON.stringify({ partes: [ENTRADA] }) }),
    );

    expect(banco.rpc).not.toHaveBeenCalled();
    expect(r.error).toBe("Negócio não informado.");
  });
});

describe("confirmarFormaPelaEquipe", () => {
  it("observação vazia: a chamada não leva p_observacao", async () => {
    const r = await confirmarFormaPelaEquipe(
      ESTADO_INICIAL,
      formulario({ negocio: NEGOCIO, pessoa: PESSOA, observacao: "  " }),
    );

    expect(banco.rpc).toHaveBeenCalledTimes(1);
    const [funcao, argumentos] = banco.rpc.mock.calls[0]!;
    expect(funcao).toBe("confirmar_forma_de_pagamento_pela_equipe");
    expect(argumentos).toStrictEqual({ p_negocio: NEGOCIO });
    expect(r.ok).toBe(true);
    // O histórico aparece no perfil da pessoa.
    expect(revalidarPessoa).toHaveBeenCalledWith(PESSOA);
    expect(revalidatePath).toHaveBeenCalledWith(`/crm/${NEGOCIO}`);
  });

  it("com observação, ela vai aparada", async () => {
    await confirmarFormaPelaEquipe(
      ESTADO_INICIAL,
      formulario({ negocio: NEGOCIO, pessoa: PESSOA, observacao: " Cliente pediu boleto " }),
    );

    expect(banco.rpc).toHaveBeenCalledWith("confirmar_forma_de_pagamento_pela_equipe", {
      p_negocio: NEGOCIO,
      p_observacao: "Cliente pediu boleto",
    });
  });

  it("observação com mais de 500 caracteres não chama o banco", async () => {
    const r = await confirmarFormaPelaEquipe(
      ESTADO_INICIAL,
      formulario({ negocio: NEGOCIO, pessoa: PESSOA, observacao: "a".repeat(501) }),
    );

    expect(banco.rpc).not.toHaveBeenCalled();
    expect(r.error).toBe("A observação vai até 500 caracteres.");
  });
});

describe("refazerFormaDePagamento", () => {
  it("chama voltar_forma_para_rascunho e revalida o lead e a pessoa", async () => {
    const r = await refazerFormaDePagamento(
      ESTADO_INICIAL,
      formulario({ negocio: NEGOCIO, pessoa: PESSOA }),
    );

    expect(banco.rpc).toHaveBeenCalledWith("voltar_forma_para_rascunho", { p_negocio: NEGOCIO });
    expect(r.ok).toBe(true);
    expect(revalidarPessoa).toHaveBeenCalledWith(PESSOA);
    expect(revalidatePath).toHaveBeenCalledWith(`/crm/${NEGOCIO}`);
  });

  it("a frase do banco volta como está", async () => {
    usar(bancoFalso({ data: null, error: { code: "P0001", message: "A forma não está confirmada." } }));

    const r = await refazerFormaDePagamento(
      ESTADO_INICIAL,
      formulario({ negocio: NEGOCIO, pessoa: PESSOA }),
    );

    expect(r.error).toBe("A forma não está confirmada.");
  });
});

describe("salvarCotacao", () => {
  it('"5,425" é cinco e 425 milésimos, gravado na forma do negócio', async () => {
    const r = await salvarCotacao(
      formulario({ plano: PLANO, negocio: NEGOCIO, reference_rate: "5,425" }),
    );

    expect(banco.from).toHaveBeenCalledWith("payment_plans");
    expect(banco.update).toHaveBeenCalledWith({ reference_rate: 5.425 });
    expect(banco.eq).toHaveBeenCalledWith("id", PLANO);
    expect(r.ok).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith(`/crm/${NEGOCIO}`);
  });

  it("cotação vazia limpa o campo", async () => {
    await salvarCotacao(formulario({ plano: PLANO, negocio: NEGOCIO, reference_rate: "" }));

    expect(banco.update).toHaveBeenCalledWith({ reference_rate: null });
  });

  it("cotação zero não chama o banco", async () => {
    const r = await salvarCotacao(
      formulario({ plano: PLANO, negocio: NEGOCIO, reference_rate: "0" }),
    );

    expect(banco.update).not.toHaveBeenCalled();
    expect(r.error).toBe("Informe uma cotação maior que zero.");
  });

  it("a anotação vai aparada, e vazia vira nula", async () => {
    await salvarCotacao(
      formulario({ plano: PLANO, negocio: NEGOCIO, reference_rate_note: " C6, 21/nov " }),
    );
    expect(banco.update).toHaveBeenCalledWith({ reference_rate_note: "C6, 21/nov" });

    await salvarCotacao(formulario({ plano: PLANO, negocio: NEGOCIO, reference_rate_note: "" }));
    expect(banco.update).toHaveBeenLastCalledWith({ reference_rate_note: null });
  });

  it("anotação com mais de 200 caracteres não chama o banco", async () => {
    const r = await salvarCotacao(
      formulario({ plano: PLANO, negocio: NEGOCIO, reference_rate_note: "a".repeat(201) }),
    );

    expect(banco.update).not.toHaveBeenCalled();
    expect(r.error).toBe("A anotação da cotação vai até 200 caracteres.");
  });
});
