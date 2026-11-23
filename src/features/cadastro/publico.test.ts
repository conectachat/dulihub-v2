// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/anonimo", () => ({ clienteAnonimo: () => ({ rpc }) }));

const { responderForma } = await import("./publico-actions");
const { abrirFicha } = await import("./publico-queries");

/**
 * A porta do cliente sem login (entrega 4b): a leitura da ficha com a forma e
 * a resposta do pagamento. O banco confere tudo de novo
 * (`responder_forma_de_pagamento`, 0065); aqui se prova o que sai daqui.
 */

const TOKEN = "a".repeat(43);

beforeEach(() => vi.clearAllMocks());

describe("responderForma", () => {
  it("motivo com mais de 500 caracteres nem sai daqui (foco 5)", async () => {
    const r = await responderForma(TOKEN, false, "x".repeat(501));
    expect(rpc).not.toHaveBeenCalled();
    expect(r.error).toBe("O motivo vai até 500 caracteres.");
  });

  it("com 500, a recusa vai com o motivo", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const motivo = "x".repeat(500);
    const r = await responderForma(TOKEN, false, motivo);
    expect(rpc).toHaveBeenCalledWith("responder_forma_de_pagamento", {
      p_token: TOKEN,
      p_aceita: false,
      p_motivo: motivo,
    });
    expect(r.error).toBeNull();
  });

  it("Confirmo não leva motivo", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await responderForma(TOKEN, true, "");
    expect(rpc).toHaveBeenCalledWith("responder_forma_de_pagamento", { p_token: TOKEN, p_aceita: true });
  });

  it("token fora do formato nem pergunta ao banco", async () => {
    const r = await responderForma("abc", true, "");
    expect(rpc).not.toHaveBeenCalled();
    expect(r.error).toBe("Este link não está mais disponível.");
  });

  it("a frase do banco volta como está", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "Este link não está mais disponível." } });
    const r = await responderForma(TOKEN, true, "");
    expect(r.error).toBe("Este link não está mais disponível.");
  });
});

describe("abrirFicha", () => {
  const linha = {
    situacao: "aguardando_pagamento",
    nome: null,
    email: null,
    ddi: null,
    telefone: null,
    organizacao: "Parceiro de Teste",
    modo: "so_pagamento",
    tem_forma: true,
    forma: {
      vistos: [{ visa_name: "EB-2 NIW", amount: 6000, currency: "USD" }],
      partes: [
        {
          label: "Cartão",
          method: "cartao",
          currency: "BRL",
          total: 21527.76,
          installments_count: 1,
          usd_equivalent: 3900,
          parcelas: [{ number: 1, amount: 21527.76, due_on: "2026-12-15" }],
        },
      ],
    },
  };

  it("lê a forma do pagamento pelo esquema", async () => {
    rpc.mockResolvedValueOnce({ data: [linha], error: null });
    const { ficha, error } = await abrirFicha(TOKEN);
    expect(error).toBeNull();
    expect(ficha).toMatchObject({ situacao: "aguardando_pagamento", modo: "so_pagamento", tem_forma: true });
    expect(ficha!.forma!.partes[0]!.usd_equivalent).toBe(3900);
  });

  it("forma fora do formato vira erro, e não uma tela pela metade", async () => {
    rpc.mockResolvedValueOnce({ data: [{ ...linha, forma: { partes: "?" } }], error: null });
    const { ficha, error } = await abrirFicha(TOKEN);
    expect(ficha).toBeNull();
    expect(error).not.toBeNull();
  });

  it("sem forma (a ficha comum), forma nula", async () => {
    rpc.mockResolvedValueOnce({
      data: [{ ...linha, situacao: "aberta", modo: "completa", tem_forma: false, forma: null }],
      error: null,
    });
    const { ficha } = await abrirFicha(TOKEN);
    expect(ficha!.forma).toBeNull();
  });
});
