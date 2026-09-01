import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Enquanto não há testes escritos, ausência não é falha. Remover assim
    // que a Fase 1 começar — a partir daí, suíte vazia é sinal de problema.
    passWithNoTests: true,
    // Testes de RLS batem num Supabase real e são lentos; ficam à parte
    // para poderem rodar isolados: `bun test tests/rls`.
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
