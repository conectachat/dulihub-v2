"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { ChevronDown, ChevronUp, Lock, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createStage,
  deleteStage,
  moveStage,
  renameStage,
  type StageActionState,
} from "@/features/settings/stage-actions";

type Stage = {
  id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  opportunity_count: number;
};

const initialState: StageActionState = { error: null };

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Plus className="mr-1 h-4 w-4" />
      {pending ? "Criando..." : "Criar etapa"}
    </Button>
  );
}

/** Salva o novo nome ao sair do campo, se mudou. */
function StageName({ stage }: { stage: Stage }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={renameStage} className="min-w-0 flex-1">
      <input type="hidden" name="id" value={stage.id} />
      <Input
        name="name"
        defaultValue={stage.name}
        aria-label={`Nome da etapa ${stage.name}`}
        onBlur={(e) => {
          if (e.target.value.trim() && e.target.value !== stage.name) {
            formRef.current?.requestSubmit();
          }
        }}
        className="h-9 rounded-xl"
      />
    </form>
  );
}

export function StagesEditor({
  pipelineId,
  stages,
}: {
  pipelineId: string;
  stages: Stage[];
}) {
  const [state, formAction] = useActionState(createStage, initialState);
  const addFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) addFormRef.current?.reset();
  }, [state.ok]);

  const middle = stages.filter((s) => !s.is_won && !s.is_lost);

  return (
    <div className="space-y-6">
      <ul className="space-y-2">
        {stages.map((stage) => {
          const terminal = stage.is_won || stage.is_lost;
          const first = middle[0]?.id === stage.id;
          const last = middle[middle.length - 1]?.id === stage.id;
          const hasCards = stage.opportunity_count > 0;

          return (
            <li
              key={stage.id}
              className="flex items-center gap-2 rounded-2xl border p-2"
            >
              <span
                className={
                  "h-2 w-2 shrink-0 rounded-full " +
                  (stage.is_won
                    ? "bg-emerald-500"
                    : stage.is_lost
                      ? "bg-destructive"
                      : "bg-muted-foreground/40")
                }
                aria-hidden
              />

              <StageName stage={stage} />

              <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                {stage.opportunity_count === 1
                  ? "1 negócio"
                  : `${stage.opportunity_count} negócios`}
              </span>

              <div className="flex shrink-0 items-center gap-0.5">
                {terminal ? (
                  <span
                    className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground/50"
                    title="Etapa de encerramento: pode ser renomeada, não excluída"
                  >
                    <Lock className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <>
                    <form action={moveStage}>
                      <input type="hidden" name="id" value={stage.id} />
                      <input type="hidden" name="direction" value="up" />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={first}
                        aria-label={`Subir ${stage.name}`}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                    </form>
                    <form action={moveStage}>
                      <input type="hidden" name="id" value={stage.id} />
                      <input type="hidden" name="direction" value="down" />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={last}
                        aria-label={`Descer ${stage.name}`}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </form>
                    <form action={deleteStage}>
                      <input type="hidden" name="id" value={stage.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        disabled={hasCards}
                        title={
                          hasCards
                            ? "Mova os negócios desta etapa antes de excluí-la"
                            : undefined
                        }
                        aria-label={`Excluir ${stage.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </form>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <form
        ref={addFormRef}
        action={formAction}
        className="flex flex-wrap items-end gap-2 rounded-2xl border border-dashed p-3"
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
        <AddButton />
      </form>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Etapas novas entram antes de ganho e perdido. Essas duas podem ser
        renomeadas, mas não excluídas — o funil precisa saber onde a negociação
        termina.
      </p>
    </div>
  );
}
