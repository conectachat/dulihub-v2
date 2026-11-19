"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

/**
 * O campo de busca de uma lista, guardado na URL (`?q=`), na rota atual.
 *
 * Estado na URL em vez de no componente: a busca sobrevive a recarregar a
 * página, pode ser compartilhada por link, e a lista continua sendo buscada
 * no servidor — o navegador nunca recebe o que o filtro escondeu.
 *
 * Buscar de novo tira o `?pagina=`: a busca nova pode ter uma página só.
 */
export function BuscaNaUrl({ placeholder, rotulo }: { placeholder: string; rotulo: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const naUrl = params.get("q") ?? "";
  const [termo, setTermo] = useState(naUrl);
  const [ultimaUrl, setUltimaUrl] = useState(naUrl);

  // A URL manda: voltar no navegador tem que se refletir no campo. Ajuste
  // durante a renderização e não em efeito — React refaz a renderização na
  // hora, antes de pintar.
  if (naUrl !== ultimaUrl) {
    setUltimaUrl(naUrl);
    setTermo(naUrl);
  }

  // Espera a digitação parar antes de consultar o banco.
  useEffect(() => {
    if (termo === naUrl) return;
    const timer = setTimeout(() => {
      const sp = new URLSearchParams(params.toString());
      if (termo) sp.set("q", termo);
      else sp.delete("q");
      sp.delete("pagina");
      const qs = sp.toString();
      startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo]);

  return (
    <div className="relative w-full max-w-md">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
        aria-label={rotulo}
      />
    </div>
  );
}
