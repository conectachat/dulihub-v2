"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Copiar um texto com um clique: telefone, e-mail, link.
 *
 * Sem `children`, é só o ícone (ao lado do texto já visível); com `children`,
 * um botão com rótulo. Copiado, o botão diz "Copiado" por dois segundos — a
 * confirmação fica onde o olho está, e não num aviso no canto.
 */
export function CopiarTexto({
  texto,
  rotulo,
  children,
}: {
  texto: string;
  /** O que se copia, para o leitor de tela: "Copiar telefone". */
  rotulo: string;
  children?: React.ReactNode;
}) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const timer = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(timer);
  }, [copiado]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      // Sem permissão de área de transferência: o texto está na tela para
      // copiar à mão.
      toast.error("Não foi possível copiar. Selecione o texto e copie.");
    }
  }

  const icone = copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />;

  if (children) {
    return (
      <Button type="button" size="sm" className="rounded-xl" onClick={copiar}>
        <span className="mr-1">{icone}</span>
        {copiado ? "Copiado" : children}
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-xl text-primary"
        onClick={copiar}
        aria-label={`Copiar ${rotulo}`}
      >
        {icone}
      </Button>
      {copiado ? <span className="text-xs text-success">Copiado</span> : null}
    </span>
  );
}
