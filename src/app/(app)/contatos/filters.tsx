"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { BuscaNaUrl } from "@/components/busca-na-url";
import { Button } from "@/components/ui/button";

/**
 * Busca e alternância ativos/excluídos, guardadas na URL.
 *
 * Estado na URL em vez de no componente: o filtro sobrevive a recarregar a
 * página, pode ser compartilhado por link, e a lista continua sendo buscada
 * no servidor — o navegador nunca recebe contato que o filtro escondeu.
 */
export function ContactFilters({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const view = params.get("view") === "excluidos" ? "excluidos" : "ativos";

  function apply(next: { view?: string }) {
    const sp = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) sp.set(key, value);
      else sp.delete(key);
    }
    startTransition(() => router.push(`/contatos?${sp.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <BuscaNaUrl placeholder="Buscar por nome, email, telefone..." rotulo="Buscar contatos" />

      {/* Slot para filtros que o servidor precisa alimentar, como o de tags. */}
      {children}

      <div className="inline-flex rounded-2xl border p-1">
        <Button
          type="button"
          size="sm"
          variant={view === "ativos" ? "secondary" : "ghost"}
          onClick={() => apply({ view: undefined })}
        >
          Ativos
        </Button>
        <Button
          type="button"
          size="sm"
          variant={view === "excluidos" ? "secondary" : "ghost"}
          onClick={() => apply({ view: "excluidos" })}
        >
          Excluídos
        </Button>
      </div>
    </div>
  );
}
