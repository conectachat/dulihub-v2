/**
 * O que o service worker faz com cada pedido.
 *
 * Função pura, testada em `estrategia.test.ts`, porque é aqui que mora o
 * defeito clássico: o service worker do app antigo prendeu arquivos velhos e
 * teve de ser substituído por um "desligador". Duas regras evitam isso, e as
 * duas estão abaixo.
 *
 * 1. **Navegação nunca vem do cache.** Página guardada aponta para pedaços
 *    de código que o deploy seguinte já apagou.
 * 2. **Só entra em cache o que muda de URL quando muda de conteúdo** —
 *    `/_next/static/**` leva hash no nome — e o punhado de arquivos do
 *    shell, que o `activate` de cada versão nova apaga.
 *
 * Nada de outra origem passa por aqui: resposta do Supabase em cache seria
 * dado de cliente guardado onde ninguém procura, e velho parecendo atual.
 */

export type Estrategia =
  | { estrategia: "ignorar" }
  | { estrategia: "cache-primeiro" }
  | { estrategia: "rede-primeiro"; reserva: string };

/** O shell offline e o que ele precisa para desenhar. */
export const DO_SHELL = [
  "/offline",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-icon.png",
];

export function decidirEstrategia(
  url: string,
  modo: string,
  origem: string,
  metodo = "GET",
): Estrategia {
  if (metodo !== "GET") return { estrategia: "ignorar" };

  const endereco = new URL(url);
  if (endereco.origin !== new URL(origem).origin) return { estrategia: "ignorar" };

  const { pathname } = endereco;

  // O próprio worker e as rotas de servidor. `/api/versao` é o interruptor
  // de emergência: guardá-lo seria desligar o jeito de desligar.
  if (pathname === "/sw.js" || pathname.startsWith("/api/") || pathname.startsWith("/auth")) {
    return { estrategia: "ignorar" };
  }

  if (modo === "navigate") return { estrategia: "rede-primeiro", reserva: "/offline" };

  if (pathname.startsWith("/_next/static/") || DO_SHELL.includes(pathname)) {
    return { estrategia: "cache-primeiro" };
  }

  return { estrategia: "ignorar" };
}

/**
 * Um cache por versão publicada. O `activate` apaga os outros, então um
 * deploy ruim se cura no deploy seguinte, sem ninguém limpar nada à mão.
 */
export function nomeDoCache(versao: string | null | undefined): string {
  return `dulihub-${versao || "dev"}`;
}
