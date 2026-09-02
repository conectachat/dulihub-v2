"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createVisaStage,
  deleteVisaStage,
  moveVisaStage,
  updateVisaStage,
  type VisaState,
} from "@/features/settings/visa-type-actions";

export type StageNode = {
  id: string;
  parent_id: string | null;
  name: string;
  position: number;
  is_required: boolean;
  estimated_days: number | null;
};

type FlatStage = StageNode & {
  depth: number;
  isFirst: boolean;
  isLast: boolean;
  descendants: number;
};

const initialState: VisaState = { error: null };

function flatten(nodes: StageNode[]): FlatStage[] {
  const byParent = new Map<string | null, StageNode[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parent_id) ?? [];
    list.push(node);
    byParent.set(node.parent_id, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.position - b.position);

  const count = (id: string): number =>
    (byParent.get(id) ?? []).reduce((sum, c) => sum + 1 + count(c.id), 0);

  const out: FlatStage[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const siblings = byParent.get(parentId) ?? [];
    siblings.forEach((node, i) => {
      out.push({
        ...node,
        depth,
        isFirst: i === 0,
        isLast: i === siblings.length - 1,
        descendants: count(node.id),
      });
      walk(node.id, depth + 1);
    });
  };
  walk(null, 0);
  return out;
}

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

/** Nome e prazo salvam ao sair do campo. */
function StageFields({ stage }: { stage: FlatStage }) {
  const nameRef = useRef<HTMLFormElement>(null);
  const daysRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={nameRef} action={updateVisaStage} className="min-w-0 flex-1">
        <input type="hidden" name="id" value={stage.id} />
        <Input
          name="name"
          defaultValue={stage.name}
          aria-label={`Nome da etapa ${stage.name}`}
          onBlur={(e) => {
            if (e.target.value.trim() && e.target.value !== stage.name) {
              nameRef.current?.requestSubmit();
            }
          }}
          className="h-8 rounded-xl border-0 bg-transparent px-2 hover:bg-muted focus-visible:bg-background"
        />
      </form>

      <form ref={daysRef} action={updateVisaStage}>
        <input type="hidden" name="id" value={stage.id} />
        <Input
          name="estimated_days"
          inputMode="numeric"
          placeholder="dias"
          defaultValue={stage.estimated_days?.toString() ?? ""}
          aria-label={`Prazo de ${stage.name} em dias`}
          onBlur={(e) => {
            const current = stage.estimated_days?.toString() ?? "";
            if (e.target.value !== current) daysRef.current?.requestSubmit();
          }}
          className="h-8 w-16 rounded-xl text-center text-xs"
        />
      </form>
    </>
  );
}

export function VisaStagesEditor({
  visaTypeId,
  stages,
}: {
  visaTypeId: string;
  stages: StageNode[];
}) {
  const flat = flatten(stages);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      {flat.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma etapa ainda. A primeira costuma ser a de coleta de documentos.
        </p>
      ) : (
        <ul className="space-y-1">
          {flat.map((stage) => (
            <li key={stage.id}>
              <div
                className="flex items-center gap-1 rounded-xl border px-2 py-1"
                style={{ marginLeft: `${stage.depth * 1.5}rem` }}
              >
                <StageFields stage={stage} />

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

                <form action={moveVisaStage}>
                  <input type="hidden" name="id" value={stage.id} />
                  <input type="hidden" name="direction" value="up" />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={stage.isFirst}
                    aria-label={`Subir ${stage.name}`}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                </form>

                <form action={moveVisaStage}>
                  <input type="hidden" name="id" value={stage.id} />
                  <input type="hidden" name="direction" value="down" />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={stage.isLast}
                    aria-label={`Descer ${stage.name}`}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </form>

                <form action={deleteVisaStage}>
                  <input type="hidden" name="id" value={stage.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label={`Excluir ${stage.name}${
                      stage.descendants > 0
                        ? ` e as ${stage.descendants} sub-etapas`
                        : ""
                    }`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </form>
              </div>

              {addingTo === stage.id ? (
                <div
                  className="mt-1 rounded-xl border border-dashed p-2"
                  style={{ marginLeft: `${(stage.depth + 1) * 1.5}rem` }}
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

      <div className="space-y-2 rounded-2xl border border-dashed p-4">
        <p className="text-sm font-medium">Nova etapa</p>
        <CreateStageForm visaTypeId={visaTypeId} parentId={null} />
      </div>
    </div>
  );
}
