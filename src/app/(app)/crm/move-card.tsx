"use client";

import { useRef } from "react";

import { moveOpportunity } from "@/features/opportunities/actions";
import { comAviso } from "@/lib/avisar";

/**
 * Seletor de etapa dentro do cartão.
 *
 * Sem arrastar-e-soltar por enquanto, e de propósito: um seletor funciona no
 * celular, no teclado e no leitor de tela, e não depende de biblioteca. Se o
 * uso pedir, o arrastar entra depois — os dados já suportam.
 */
export function MoveCard({
  opportunityId,
  currentStageId,
  stages,
}: {
  opportunityId: string;
  currentStageId: string;
  stages: { id: string; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={comAviso(moveOpportunity)}>
      <input type="hidden" name="id" value={opportunityId} />
      <select
        name="stage_id"
        defaultValue={currentStageId}
        onChange={() => formRef.current?.requestSubmit()}
        aria-label="Mover para outra etapa"
        className="w-full rounded-xl border-0 bg-muted px-2 py-1 text-xs text-muted-foreground"
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </form>
  );
}
