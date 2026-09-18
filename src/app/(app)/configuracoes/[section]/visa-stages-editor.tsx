"use client";

import { useActionState, useState } from "react";
import { ListChecks, Plus } from "lucide-react";

import { ESTADO_INICIAL } from "@/lib/action-state";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { InlineText } from "@/components/inline-text";
import { MoveButtons } from "@/components/move-buttons";
import { FieldError } from "@/components/field-error";
import { SubmitButton } from "@/components/submit-button";
import { RequiredToggle } from "@/components/required-toggle";
import { AddChildButton, TreeRow } from "@/components/tree-row";
import { Input } from "@/components/ui/input";
import {
  createVisaStage,
  deleteVisaStage,
  moveVisaStage,
  updateVisaStage,
} from "@/features/settings/visa-type-actions";
import { flattenTree } from "@/lib/tree";

export type StageNode = {
  id: string;
  parent_id: string | null;
  name: string;
  position: number;
  is_required: boolean;
  estimated_days: number | null;
};

/**
 * O `key` no formulário é o que limpa os campos depois de gravar.
 *
 * A versão anterior usava `useEffect(..., [state.ok])`, e isso só funcionava
 * na primeira vez: `ok` continua verdadeiro depois do primeiro sucesso, o
 * efeito não roda de novo, e a segunda etapa criada deixava o nome digitado no
 * campo. `token` muda a cada gravação; remontar devolve o formulário limpo.
 *
 * O painel de sub-etapa também deixou de fechar sozinho: quem abre para criar
 * uma sub-etapa costuma criar duas ou três seguidas.
 */
function CreateStageForm({
  visaTypeId,
  parentId,
}: {
  visaTypeId: string;
  parentId: string | null;
}) {
  const [state, formAction] = useActionState(createVisaStage, ESTADO_INICIAL);

  return (
    <form
      key={state.token ?? "novo"}
      action={formAction}
      className="space-y-2"
    >
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
        <SubmitButton pendente="Criando..." size="sm" icone={<Plus className="h-4 w-4" />}>Adicionar</SubmitButton>
      </div>
      <FieldError mensagem={state.error} />
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
              <TreeRow
                depth={stage.depth}
                aberto={addingTo === stage.id}
                painel={
                  <CreateStageForm visaTypeId={visaTypeId} parentId={stage.id} />
                }
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

                <RequiredToggle
                  action={updateVisaStage}
                  hidden={{ id: stage.id }}
                  obrigatorio={stage.is_required}
                  genero="feminino"
                  titulo="Alternar entre obrigatória e opcional"
                />

                <AddChildButton
                  aberto={addingTo === stage.id}
                  onToggle={() =>
                    setAddingTo(addingTo === stage.id ? null : stage.id)
                  }
                  rotulo={`Adicionar sub-etapa em ${stage.name}`}
                />

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
                  consequence={`As ${stage.descendantIds.length} sub-etapas dentro dela vão junto. Processos já criados a partir deste molde não são afetados — a cópia dentro do processo é independente.`}
                  confirmLabel="Excluir tudo"
                  triggerLabel={`Excluir ${stage.name}`}
                  needsConfirmation={stage.descendantIds.length > 0}
                />
              </TreeRow>
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}
