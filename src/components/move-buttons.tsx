"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AcaoDeFormulario } from "@/lib/action-state";
import { comAviso } from "@/lib/avisar";

/**
 * Botões de subir e descer, para reordenar entre irmãos.
 *
 * Navy, como todo ícone de ação nesta base — cinza fazia a tela inteira parecer
 * desligada. Desabilitado o `Button` já esmaece sozinho.
 *
 * Substitui arrastar-e-soltar em toda a base, e é escolha, não limitação:
 * funciona no celular, no teclado e no leitor de tela, sem depender de
 * biblioteca. Numa árvore o arrastar é ainda pior — soltar entre dois níveis é
 * ambíguo: o item vai depois daquele ou dentro dele? Botão não tem essa dúvida.
 *
 * A recusa vira aviso flutuante, e não texto na linha: aqui não há onde
 * escrever — a linha é duas setas. E a lista já volta sozinha à ordem certa,
 * porque a ordem vem do servidor.
 */
export function MoveButtons({
  action,
  hidden,
  label,
  isFirst,
  isLast,
}: {
  action: AcaoDeFormulario;
  hidden: Record<string, string>;
  /** Nome do item, para o leitor de tela. */
  label: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const enviar = comAviso(action);

  const fields = Object.entries(hidden).map(([key, value]) => (
    <input key={key} type="hidden" name={key} value={value} />
  ));

  return (
    <>
      <form action={enviar}>
        {fields}
        <input type="hidden" name="direction" value="up" />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-primary"
          disabled={isFirst}
          aria-label={`Subir ${label}`}
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
      </form>

      <form action={enviar}>
        {fields}
        <input type="hidden" name="direction" value="down" />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-primary"
          disabled={isLast}
          aria-label={`Descer ${label}`}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </form>
    </>
  );
}
