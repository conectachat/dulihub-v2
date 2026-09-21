// @vitest-environment node

import { describe, expect, it } from "vitest";

import { decidirEstrategia, nomeDoCache } from "./estrategia";

/**
 * As regras do service worker.
 *
 * Existem por causa do app antigo: o service worker dele prendeu arquivos
 * velhos no navegador de quem já tinha visitado, e a saída foi publicar um
 * "desligador" que apaga o cache e se desregistra
 * (`../DuliHub/public/sw.js`). O que causa isso é sempre a mesma coisa —
 * responder navegação com cópia guardada, ou guardar arquivo cuja URL não
 * muda quando o conteúdo muda.
 *
 * Aqui a decisão é uma função pura, e cada regra tem um teste.
 */

describe("decidirEstrategia", () => {
  const origem = "https://dulihub-v2.vercel.app";

  it("navegação é rede primeiro, com o shell como reserva — nunca cache primeiro", () => {
    // A regra que impede repetir o defeito do app antigo: uma página
    // guardada aponta para pedaços de código que o deploy seguinte apagou.
    expect(decidirEstrategia(`${origem}/projetos`, "navigate", origem)).toEqual({
      estrategia: "rede-primeiro",
      reserva: "/offline",
    });
    expect(decidirEstrategia(`${origem}/`, "navigate", origem)).toEqual({
      estrategia: "rede-primeiro",
      reserva: "/offline",
    });
  });

  it("arquivo do build fica em cache: a URL muda quando o conteúdo muda", () => {
    expect(
      decidirEstrategia(`${origem}/_next/static/chunks/abc123.js`, "cors", origem),
    ).toEqual({ estrategia: "cache-primeiro" });
  });

  it("o shell e os ícones ficam em cache — é o que faz o app abrir offline", () => {
    for (const caminho of ["/offline", "/manifest.webmanifest", "/icon-192.png"]) {
      expect(decidirEstrategia(`${origem}${caminho}`, "cors", origem).estrategia).toBe(
        "cache-primeiro",
      );
    }
  });

  it("nada de outra origem passa pelo service worker", () => {
    // Resposta do Supabase em cache seria dado velho mostrado como atual —
    // e ainda por cima dado de cliente guardado onde ninguém procura.
    for (const url of [
      "https://xigmtofpmfqeehhcdasf.supabase.co/rest/v1/people",
      "https://fonts.gstatic.com/s/lora.woff2",
    ]) {
      expect(decidirEstrategia(url, "cors", origem)).toEqual({ estrategia: "ignorar" });
    }
  });

  it("nossas rotas de servidor não entram em cache", () => {
    // `/api/versao` é o interruptor de emergência: guardá-lo seria desligar
    // o próprio jeito de desligar.
    for (const caminho of ["/api/versao", "/api/observacoes/arquivo?c=x", "/auth/callback"]) {
      expect(decidirEstrategia(`${origem}${caminho}`, "cors", origem)).toEqual({
        estrategia: "ignorar",
      });
    }
  });

  it("o próprio sw.js nunca entra em cache", () => {
    expect(decidirEstrategia(`${origem}/sw.js?v=abc`, "cors", origem)).toEqual({
      estrategia: "ignorar",
    });
  });

  it("pedido que não é GET passa direto", () => {
    expect(decidirEstrategia(`${origem}/projetos`, "cors", origem, "POST")).toEqual({
      estrategia: "ignorar",
    });
  });
});

describe("nomeDoCache", () => {
  it("leva a versão do build: o deploy novo não lê o cache do antigo", () => {
    expect(nomeDoCache("abc123")).toBe("dulihub-abc123");
    expect(nomeDoCache("abc123")).not.toBe(nomeDoCache("def456"));
  });

  it("sem versão, usa 'dev' — em desenvolvimento não há hash de build", () => {
    expect(nomeDoCache("")).toBe("dulihub-dev");
    expect(nomeDoCache(null)).toBe("dulihub-dev");
  });
});
