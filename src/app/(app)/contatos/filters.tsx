"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

  const currentSearch = params.get("q") ?? "";
  const view = params.get("view") === "excluidos" ? "excluidos" : "ativos";
  const [term, setTerm] = useState(currentSearch);

  useEffect(() => setTerm(currentSearch), [currentSearch]);

  function apply(next: { q?: string; view?: string }) {
    const sp = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) sp.set(key, value);
      else sp.delete(key);
    }
    startTransition(() => router.push(`/contatos?${sp.toString()}`));
  }

  // Espera a digitação parar antes de consultar o banco.
  useEffect(() => {
    if (term === currentSearch) return;
    const timer = setTimeout(() => apply({ q: term }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Buscar por nome, email, telefone..."
          className="pl-9"
          aria-label="Buscar contatos"
        />
      </div>

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
