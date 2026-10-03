import { describe, expect, it } from "vitest";

import { origemDoPedido } from "./origem";

const pedido = (cabecalhos: Record<string, string>) => new Headers(cabecalhos);

describe("origemDoPedido", () => {
  it("atrás do proxy, usa o protocolo e o host que o proxy informa", () => {
    expect(
      origemDoPedido(
        pedido({
          host: "interno:3000",
          "x-forwarded-host": "dulihub-v2.vercel.app",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe("https://dulihub-v2.vercel.app");
  });

  it("no servidor local é http — https geraria um link que não abre", () => {
    expect(origemDoPedido(pedido({ host: "localhost:3000" }))).toBe("http://localhost:3000");
  });

  it("sem informação de protocolo fora do local, assume https", () => {
    expect(origemDoPedido(pedido({ host: "hub.example" }))).toBe("https://hub.example");
  });
});
