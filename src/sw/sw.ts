/// <reference lib="webworker" />

import { decidirEstrategia, DO_SHELL, nomeDoCache } from "@/lib/sw/estrategia";

/**
 * Service worker do DuliHub. Compilado para `public/sw.js` por
 * `bun run sw` (roda antes de `dev` e de `build`), para que a regra que o
 * navegador executa seja a mesma que os testes provam.
 *
 * A versão vem na própria URL do registro (`/sw.js?v=<commit>`): URL
 * diferente é worker diferente para o navegador, e é o que faz o deploy novo
 * substituir o antigo.
 *
 * **Não** chama `skipWaiting()` sozinho. A página avisa "Nova versão" e só
 * troca quando a pessoa aceita — trocar no meio de uma edição das
 * Observações descartaria texto.
 */

const sw = self as unknown as ServiceWorkerGlobalScope;

const VERSAO = new URL(sw.location.href).searchParams.get("v");
const CACHE = nomeDoCache(VERSAO);

sw.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Falhar aqui não pode derrubar a instalação: sem shell o app só perde
      // a tela de offline.
      Promise.allSettled(DO_SHELL.map((caminho) => cache.add(caminho))),
    ),
  );
});

sw.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.allSettled(
        nomes.filter((n) => n.startsWith("dulihub-") && n !== CACHE).map((n) => caches.delete(n)),
      );
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  const decisao = decidirEstrategia(
    pedido.url,
    pedido.mode,
    sw.location.origin,
    pedido.method,
  );

  if (decisao.estrategia === "ignorar") return;

  if (decisao.estrategia === "cache-primeiro") {
    evento.respondWith(
      caches.match(pedido).then(
        (guardado) =>
          guardado ??
          fetch(pedido).then((resposta) => {
            if (resposta.ok) {
              const copia = resposta.clone();
              void caches.open(CACHE).then((cache) => cache.put(pedido, copia));
            }
            return resposta;
          }),
      ),
    );
    return;
  }

  // Rede primeiro. Sem rede, a casca — que não tem dado nenhum e monta o app
  // no navegador, que lê o que estiver guardado no aparelho.
  evento.respondWith(
    fetch(pedido)
      .then((resposta) => {
        // Guarda a casca das rotas que já desenham do espelho (a reserva é a
        // própria rota). Sem isto, a navegação offline não tem o que abrir.
        if (resposta.ok && decisao.reserva !== "/offline") {
          const copia = resposta.clone();
          void caches.open(CACHE).then((cache) => cache.put(decisao.reserva, copia));
        }
        return resposta;
      })
      .catch(async () => {
      const shell = await caches.match(decisao.reserva);
      return (
        shell ??
        (await caches.match("/offline")) ??
        new Response("Sem conexão.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      );
    }),
  );
});

/** A página manda trocar quando a pessoa aceita a versão nova. */
sw.addEventListener("message", (evento) => {
  if ((evento.data as { tipo?: string } | null)?.tipo === "trocar-agora") {
    void sw.skipWaiting();
  }
});
