import { fileURLToPath } from "node:url";

import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Testes de RLS batem num Supabase real; ficam à parte para poderem rodar
    // isolados. `bun run test` roda a unidade, `bun run test:rls` roda estes.
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    // Prefixo vazio: carrega o `.env.local` inteiro, não só o que começa com
    // `VITE_`. É de lá que saem a URL do projeto e as senhas de teste — que
    // nunca entram no repositório.
    env: loadEnv("", process.cwd(), ""),
    // Bibliotecas do editor (Plate) importam CSS de dentro do pacote. O Node
    // não sabe carregar `.css`; processadas pelo Vite, o CSS vira vazio no
    // teste — como o Next faz no build.
    server: { deps: { inline: [/@platejs/, /react-tweet/, /katex/] } },
  },
  resolve: {
    // `fileURLToPath` e não `.pathname`: no Windows o pathname vem como
    // `/D:/Projetos%20Apps/...` — barra sobrando e espaço codificado —, e o
    // alias silenciosamente não resolve. Ficou escondido enquanto todo teste
    // importava por caminho relativo; o primeiro `@/...` derrubou a suíte.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
