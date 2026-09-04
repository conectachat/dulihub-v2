"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Rede de segurança para exceção não tratada.
 *
 * Fica em `src/app/` e **não** em `src/app/(app)/` de propósito: `error.tsx`
 * não envolve o `layout.tsx` irmão, e `(app)` é grupo de rota — seu pai é a
 * raiz. Daqui, este arquivo cobre `(app)/layout.tsx`, `configuracoes/layout.tsx`
 * e toda página abaixo, enquanto o layout raiz segue renderizando com fonte e
 * estilo.
 *
 * Antes disto, exceção em qualquer consulta dava tela branca sem explicação.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-3xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <h1 className="font-serif text-xl font-medium">Algo quebrou aqui</h1>
        </div>

        <p className="text-sm text-muted-foreground">
          A falha foi nesta tela, não nos seus dados — nada foi perdido nem
          alterado. Tente de novo; se repetir, mande o código abaixo para quem
          cuida do sistema.
        </p>

        {/*
          `digest` é o identificador que o Next grava no log do servidor. É o
          que liga o que a pessoa viu ao que de fato aconteceu — sem ele, o
          relato é "deu erro" e não há o que investigar.
        */}
        {error.digest ? (
          <p className="rounded-xl bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
            {error.digest}
          </p>
        ) : null}

        <Button onClick={reset} className="w-full">
          <RotateCcw className="mr-1 h-4 w-4" />
          Tentar de novo
        </Button>
      </div>
    </main>
  );
}
