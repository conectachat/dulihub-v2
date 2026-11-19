"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Abas com a aberta na URL (`?aba=`): o link e o recarregar levam à mesma
 * aba, e um atalho de outra tela pode abrir uma aba certa.
 *
 * Trocar de aba usa `history.replaceState`, que o Next integra ao
 * `useSearchParams`: não refaz a página no servidor, não rola a tela e não
 * enche o "voltar" do navegador de abas. Aba desconhecida abre a padrão.
 *
 * As abas rolam na horizontal quando não cabem (celular), sem rolar a página.
 * O conteúdo vem como filhos: `TabsContent` com o `value` de cada aba.
 */
export function AbasNaUrl({
  abas,
  padrao,
  children,
}: {
  abas: readonly { valor: string; rotulo: React.ReactNode }[];
  padrao: string;
  children: React.ReactNode;
}) {
  const params = useSearchParams();
  const pedida = params.get("aba");
  const daUrl = abas.some((a) => a.valor === pedida) ? pedida : null;

  const [escolhida, setEscolhida] = useState(daUrl);
  const [ultimaUrl, setUltimaUrl] = useState(daUrl);
  // A URL manda quando muda por fora (um link para outra aba desta tela).
  // Ajuste durante a renderização, não em efeito.
  if (daUrl !== ultimaUrl) {
    setUltimaUrl(daUrl);
    setEscolhida(daUrl);
  }

  function trocar(valor: string) {
    setEscolhida(valor);
    const sp = new URLSearchParams(params.toString());
    sp.set("aba", valor);
    window.history.replaceState(null, "", `?${sp.toString()}`);
  }

  return (
    <Tabs value={escolhida ?? padrao} onValueChange={trocar}>
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList className="rounded-2xl">
          {abas.map((a) => (
            <TabsTrigger key={a.valor} value={a.valor} className="rounded-xl">
              {a.rotulo}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {children}
    </Tabs>
  );
}
