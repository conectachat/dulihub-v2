"use client";

import { useActionState, useEffect, useRef } from "react";
import { Lock, Plus } from "lucide-react";

import { ESTADO_INICIAL } from "@/lib/action-state";
import { ConfirmAction } from "@/components/confirm-action";
import { InlineText } from "@/components/inline-text";
import { MoveButtons } from "@/components/move-buttons";
import { FieldError } from "@/components/field-error";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import {
  createStage,
  deleteStage,
  moveStage,
  renameStage,
} from "@/features/settings/stage-actions";
import { cn } from "@/lib/utils";

type Stage = {
  id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  opportunity_count: number;
};

export function StagesEditor({
  pipelineId,
  stages,
}: {
  pipelineId: string;
  stages: Stage[];
}) {
  const [state, formAction] = useActionState(createStage, ESTADO_INICIAL);
  const addFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) addFormRef.current?.reset();
  }, [state.ok]);

  // Ganho e perdido não se movem, então a vizinhança que importa é a do meio.
  const middle = stages.filter((s) => !s.is_won && !s.is_lost);

  return (
    <div className="space-y-6">
      {/*
        Criar vem antes da lista de propósito: com o funil cheio, o campo no
        fim obrigaria a rolar até embaixo a cada etapa nova.
      */}
      <form
        ref={addFormRef}
        action={formAction}
        className="flex flex-wrap items-end gap-2 rounded-3xl border border-dashed p-3"
      >
        <input type="hidden" name="pipeline_id" value={pipelineId} />
        <div className="min-w-48 flex-1 space-y-1">
          <label htmlFor="new-stage" className="text-sm font-medium">
            Nova etapa
          </label>
          <Input
            id="new-stage"
            name="name"
            placeholder="Ex.: Proposta enviada"
            required
            className="rounded-xl"
          />
        </div>
        <SubmitButton pendente="Criando..." icone={Plus}>Criar etapa</SubmitButton>
      </form>

      <FieldError mensagem={state.error} />

      <ul className="space-y-2">
        {stages.map((stage) => {
          const terminal = stage.is_won || stage.is_lost;
          const hasCards = stage.opportunity_count > 0;

          return (
            <li
              key={stage.id}
              className="flex items-center gap-2 rounded-2xl border p-2"
            >
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  stage.is_won
                    ? "bg-success"
                    : stage.is_lost
                      ? "bg-destructive"
                      : "bg-muted-foreground/40",
                )}
                aria-hidden
              />

              <InlineText
                action={renameStage}
                name="name"
                value={stage.name}
                hidden={{ id: stage.id }}
                label={`Nome da etapa ${stage.name}`}
                className="flex-1"
              />

              <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                {stage.opportunity_count === 1
                  ? "1 negócio"
                  : `${stage.opportunity_count} negócios`}
              </span>

              <div className="flex shrink-0 items-center gap-0.5">
                {terminal ? (
                  <span
                    className="inline-flex h-8 w-8 items-center justify-center text-primary/40"
                    title="Etapa de encerramento: pode ser renomeada, não excluída"
                  >
                    <Lock className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <>
                    <MoveButtons
                      action={moveStage}
                      hidden={{ id: stage.id }}
                      label={stage.name}
                      isFirst={middle[0]?.id === stage.id}
                      isLast={middle[middle.length - 1]?.id === stage.id}
                    />
                    <ConfirmAction
                      action={deleteStage}
                      hidden={{ id: stage.id }}
                      title={`Excluir “${stage.name}”?`}
                      consequence="A etapa sai do funil para todo mundo da organização, junto com a posição dela. Só é possível porque não há negócio parado aqui — os que já passaram por ela mantêm o registro no histórico. Não dá para desfazer."
                      triggerLabel={`Excluir ${stage.name}`}
                      disabled={hasCards}
                      disabledReason="Mova os negócios desta etapa antes de excluí-la"
                    />
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-sm text-muted-foreground">
        Etapas novas entram antes de ganho e perdido. Essas duas podem ser
        renomeadas, mas não excluídas — o funil precisa saber onde a negociação
        termina.
      </p>
    </div>
  );
}
