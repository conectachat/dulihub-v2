import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Testes de RLS batem num Supabase real e são lentos; ficam à parte
    // para poderem rodar isolados: `bun test tests/rls`.
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
  },
  resolve: {
    // `fileURLToPath` e não `.pathname`: no Windows o pathname vem como
    // `/D:/Projetos%20Apps/...` — barra sobrando e espaço codificado —, e o
    // alias silenciosamente não resolve. Ficou escondido enquanto todo teste
    // importava por caminho relativo; o primeiro `@/...` derrubou a suíte.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
