"use client";

import { CloudOff, TriangleAlert } from "lucide-react";

/**
 * O selo de "isto ainda não está no servidor".
 *
 * Some sozinho quando o item sai da fila. Enquanto está aqui, a pessoa sabe
 * que fechar o notebook agora perde aquilo — é a única diferença visível
 * entre "salvo" e "salvo neste aparelho".
 *
 * Recusa nunca desaparece calada: fica em vermelho, com o motivo, e quem
 * decide é quem gravou, na bandeja (Configuração › Sincronização).
 */
export function SeloPendente({
  pendente,
  conflito,
}: {
  pendente?: boolean;
  conflito?: string | null;
}) {
  if (conflito) {
    return (
      <span
        className="flex shrink-0 items-center gap-1 text-xs text-destructive"
        title={conflito}
      >
        <TriangleAlert className="h-3 w-3" />
        Não aceita
      </span>
    );
  }

  if (!pendente) return null;

  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      <CloudOff className="h-3 w-3" />
      Só neste aparelho
    </span>
  );
}
