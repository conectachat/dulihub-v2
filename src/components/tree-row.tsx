"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { indentStyle } from "@/lib/tree";

/**
 * A moldura de uma linha de árvore, e o painel de criar filho embaixo dela.
 *
 * Só a moldura: recuo, borda e o painel tracejado. O conteúdo da linha fica
 * com quem usa, porque o catálogo de documentos e as etapas do visto carregam
 * controles diferentes — prazo em dias, obrigatoriedade, ícone de pasta. O que
 * elas repetiam de verdade era esta casca, e era o recuo que mais custava
 * divergir: duas escalas diferentes e a hierarquia deixa de ser legível.
 *
 * O `<li>` e o `key` ficam fora de propósito: quem monta a lista é quem sabe o
 * que identifica cada linha.
 */
export function TreeRow({
  depth,
  aberto = false,
  painel,
  children,
}: {
  depth: number;
  /** Painel de criar filho visível. */
  aberto?: boolean;
  painel?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className="flex items-center gap-1 rounded-2xl border px-2 py-1"
        style={indentStyle(depth)}
      >
        {children}
      </div>

      {aberto ? (
        <div
          className="mt-1 rounded-2xl border border-dashed p-2"
          style={indentStyle(depth + 1)}
        >
          {painel}
        </div>
      ) : null}
    </>
  );
}

/**
 * Abre e fecha o painel de criar um filho desta linha.
 *
 * `aria-expanded` importa: sem ele o leitor de tela anuncia um botão de mais
 * sem dizer que ele revela um formulário logo abaixo.
 */
export function AddChildButton({
  aberto,
  onToggle,
  rotulo,
}: {
  aberto: boolean;
  onToggle: () => void;
  /** Para leitor de tela — "Adicionar dentro de Rendimentos". */
  rotulo: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-primary"
      onClick={onToggle}
      aria-label={rotulo}
      aria-expanded={aberto}
    >
      <Plus className="h-4 w-4" />
    </Button>
  );
}
