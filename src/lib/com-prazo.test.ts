// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { comPrazo } from "./com-prazo";

/**
 * Esperar uma promessa, mas não para sempre. Wi-Fi sem saída deixa a
 * sincronia pendurada, e a tela não pode esconder o que já está no aparelho
 * esperando por ela (D5).
 */

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("comPrazo", () => {
  it("terminou a tempo", async () => {
    await expect(comPrazo(Promise.resolve(), 5000)).resolves.toBe("ok");
  });

  it("falhou: não lança, diz que falhou", async () => {
    await expect(comPrazo(Promise.reject(new Error("x")), 5000)).resolves.toBe("falhou");
  });

  it("não respondeu: o prazo vence", async () => {
    let fim: string | null = null;
    void comPrazo(new Promise(() => {}), 5000).then((r) => (fim = r));

    await vi.advanceTimersByTimeAsync(4999);
    expect(fim).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    expect(fim).toBe("prazo");
  });
});
