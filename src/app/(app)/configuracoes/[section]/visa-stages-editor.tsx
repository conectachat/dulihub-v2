"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ListChecks, Plus } from "lucide-react";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { InlineText } from "@/components/inline-text";
import { MoveButtons } from "@/components/move-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createVisaStage,
  deleteVisaStage,
  moveVisaStage,
  updateVisaStage,
  type VisaState,
} from "@/features/settings/visa-type-actions";
import { flattenTree, indentStyle } from "@/lib/tree";

export type StageNode = {
  id: string;
  parent_id: string | null;
  name: string;
  position: number;
  is_required: boolean;
  estimated_days: number | null;
};

const initialState: VisaState = { error: null };

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Plus className="mr-1 h-4 w-4" />
      {pending ? "Criando..." : "Adicionar"}
    </Button>
  );
}

function CreateStageForm({
  visaTypeId,
  parentId,
  onDone,
}: {
  visaTypeId: string;
  parentId: string | null;
  onDone?: () => void;
}) {
  const [state, formAction] = useActionState(createVisaStage, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      onDone?.();
    }
  }, [state.ok, onDone]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="visa_type_id" value={visaTypeId} />
      {parentId ? <input type="hidden" name="parent_id" value={parentId} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="name"
          placeholder="Ex.: Montagem da petição"
          required
          className="h-9 min-w-48 flex-1 rounded-xl"
        />
        <Input
          name="estimated_days"
          inputMode="numeric"
          placeholder="dias"
          className="h-9 w-20 rounded-xl"
          aria-label="Prazo estimado em dias"
        />
        <AddButton />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function VisaStagesEditor({
  visaTypeId,
  stages,
}: {
  visaTypeId: string;
  stages: StageNode[];
}) {
  const flat = flattenTree(stages);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      {/*
        Criar vem antes da lista de propósito: com a lista cheia, o campo no
        fim obrigaria a rolar até embaixo a cada etapa nova.
      */}
      <div className="space-y-2 rounded-3xl border border-dashed p-4">
        <p className="text-sm font-medium">Nova etapa</p>
        <CreateStageForm visaTypeId={visaTypeId} parentId={null} />
      </div>

      {flat.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Nenhuma etapa ainda"
          hint="A primeira costuma ser a de coleta de documentos."
        />
      ) : (
        <ul className="space-y-1">
          {flat.map((stage) => (
            <li key={stage.id}>
              <div
                className="flex items-center gap-1 rounded-2xl border px-2 py-1"
                style={indentStyle(stage.depth)}
              >
                <InlineText
                  action={updateVisaStage}
                  name="name"
                  value={stage.name}
                  hidden={{ id: stage.id }}
                  label={`Nome da etapa ${stage.name}`}
                  className="flex-1"
                />

                <InlineText
                  action={updateVisaStage}
                  name="estimated_days"
                  value={stage.estimated_days?.toString() ?? ""}
                  hidden={{ id: stage.id }}
                  label={`Prazo de ${stage.name} em dias`}
                  placeholder="dias"
                  inputMode="numeric"
                  required={false}
                  className="w-16 shrink-0"
                />

                <form action={updateVisaStage}>
                  <input type="hidden" name="id" value={stage.id} />
                  <input
                    type="hidden"
                    name="is_required"
                    value={String(!stage.is_required)}
                  />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-xl text-xs"
                    title="Alternar entre obrigatória e opcional"
                  >
                    {stage.is_required ? "Obrigatória" : "Opcional"}
                  </Button>
                </form>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setAddingTo(addingTo === stage.id ? null : stage.id)}
                  aria-label={`Adicionar sub-etapa em ${stage.name}`}
                  aria-expanded={addingTo === stage.id}
                >
                  <Plus className="h-4 w-4" />
                </Button>

                <MoveButtons
                  action={moveVisaStage}
                  hidden={{ id: stage.id }}
                  label={stage.name}
                  isFirst={stage.isFirst}
                  isLast={stage.isLast}
                />

                <ConfirmAction
                  action={deleteVisaStage}
                  hidden={{ id: stage.id }}
                  title={`Excluir “${stage.name}”?`}
                  consequence={`As ${stage.descendants} sub-etapas dentro dela vão junto. Processos já criados a partir deste molde não são afetados — a cópia dentro do processo é independente.`}
                  confirmLabel="Excluir tudo"
                  triggerLabel={`Excluir ${stage.name}`}
                  needsConfirmation={stage.descendants > 0}
                />
              </div>

              {addingTo === stage.id ? (
                <div
                  className="mt-1 rounded-2xl border border-dashed p-2"
                  style={indentStyle(stage.depth + 1)}
                >
                  <CreateStageForm
                    visaTypeId={visaTypeId}
                    parentId={stage.id}
                    onDone={() => setAddingTo(null)}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}
