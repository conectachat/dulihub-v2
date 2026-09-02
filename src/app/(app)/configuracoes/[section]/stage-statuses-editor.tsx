"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, CircleDot, Lock, Plus } from "lucide-react";

import { ColorPicker } from "@/components/color-picker";
import { ColorPickerPopover } from "@/components/color-picker-popover";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { InlineText } from "@/components/inline-text";
import { MoveButtons } from "@/components/move-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createStageStatus,
  deleteStageStatus,
  moveStageStatus,
  setDefaultStageStatus,
  toggleStageStatusDone,
  updateStageStatus,
  type StageStatusState,
} from "@/features/settings/stage-status-actions";
import { DEFAULT_COLOR } from "@/lib/palette";
import { cn } from "@/lib/utils";

export type StageStatus = {
  id: string;
  code: string;
  label: string;
  color: string | null;
  position: number;
  is_default: boolean;
  is_done: boolean;
  is_system: boolean;
};

const initialState: StageStatusState = { error: null };

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Plus className="mr-1 h-4 w-4" />
      {pending ? "Criando..." : "Criar status"}
    </Button>
  );
}

function StatusRow({
  status,
  isFirst,
  isLast,
}: {
  status: StageStatus;
  isFirst: boolean;
  isLast: boolean;
}) {
  const colorFormRef = useRef<HTMLFormElement>(null);
  const [color, setColor] = useState(status.color ?? DEFAULT_COLOR);

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-2xl border p-2">
      <form ref={colorFormRef} action={updateStageStatus} className="flex">
        <input type="hidden" name="id" value={status.id} />
        <input type="hidden" name="label" value={status.label} />
        <input type="hidden" name="color" value={color} />
        <ColorPickerPopover
          value={color}
          label={`Cor de ${status.label}`}
          onChange={(next) => {
            setColor(next);
            // Espera o estado virar valor do campo antes de enviar.
            queueMicrotask(() => colorFormRef.current?.requestSubmit());
          }}
        />
      </form>

      {/* A cor viaja junto para não ser apagada pela atualização do nome. */}
      <InlineText
        action={updateStageStatus}
        name="label"
        value={status.label}
        hidden={{ id: status.id, color }}
        label={`Nome do status ${status.label}`}
        className="min-w-40 flex-1"
      />

      <form action={toggleStageStatusDone}>
        <input type="hidden" name="id" value={status.id} />
        <input type="hidden" name="is_done" value={String(!status.is_done)} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 rounded-xl text-xs",
            status.is_done ? "text-success" : "text-muted-foreground",
          )}
          title="Etapa neste status conta como concluída no progresso do processo"
        >
          <Check className="mr-1 h-3.5 w-3.5" />
          {status.is_done ? "Conclui a etapa" : "Não conclui"}
        </Button>
      </form>

      {status.is_default ? (
        <span
          className="inline-flex h-8 items-center gap-1 rounded-xl px-2 text-xs font-medium text-primary"
          title="Toda etapa nova começa neste status"
        >
          <CircleDot className="h-3.5 w-3.5" />
          Padrão
        </span>
      ) : (
        <form action={setDefaultStageStatus}>
          <input type="hidden" name="id" value={status.id} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="h-8 rounded-xl text-xs text-primary"
            title="Fazer deste o status de toda etapa nova"
          >
            Tornar padrão
          </Button>
        </form>
      )}

      <div className="flex shrink-0 items-center gap-0.5">
        <MoveButtons
          action={moveStageStatus}
          hidden={{ id: status.id }}
          label={status.label}
          isFirst={isFirst}
          isLast={isLast}
        />

        {status.is_system ? (
          <span
            className="inline-flex h-8 w-8 items-center justify-center text-primary/40"
            title="Status de fábrica: pode ser renomeado e recolorido, não excluído"
          >
            <Lock className="h-3.5 w-3.5" />
          </span>
        ) : (
          <ConfirmAction
            action={deleteStageStatus}
            hidden={{ id: status.id }}
            title={`Excluir o status “${status.label}”?`}
            consequence="Etapas que estiverem neste status ficam sem status. Não dá para desfazer."
            triggerLabel={`Excluir ${status.label}`}
            disabled={status.is_default}
            disabledReason="Escolha outro status como padrão antes de excluir este"
          />
        )}
      </div>
    </li>
  );
}

/**
 * Bloco de criação.
 *
 * Vive separado e é remontado pela `key` a cada sucesso: assim campo e cor
 * voltam ao estado inicial sem efeito nenhum limpando estado depois do fato.
 */
function CreateStatusForm({
  action,
}: {
  action: (formData: FormData) => void;
}) {
  const [newColor, setNewColor] = useState<string>(DEFAULT_COLOR);

  return (
    <form
      action={action}
      className="space-y-3 rounded-3xl border border-dashed p-4"
    >
      <div className="space-y-1">
        <label htmlFor="new-status" className="text-sm font-medium">
          Novo status
        </label>
        <Input
          id="new-status"
          name="label"
          placeholder="Ex.: Aguardando cliente, Em revisão, Não se aplica"
          required
          className="rounded-xl"
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Cor</p>
        <ColorPicker
          name="color"
          label="Cor do novo status"
          value={newColor}
          onChange={setNewColor}
        />
      </div>

      <CreateButton />
    </form>
  );
}

export function StageStatusesEditor({ statuses }: { statuses: StageStatus[] }) {
  const [state, formAction] = useActionState(createStageStatus, initialState);

  return (
    <div className="space-y-6">
      {/*
        Criar vem antes da lista de propósito: com a lista cheia, o campo no
        fim obrigaria a rolar até embaixo a cada status novo.
      */}
      <CreateStatusForm key={state.token ?? 0} action={formAction} />

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      {statuses.length === 0 ? (
        <EmptyState
          icon={CircleDot}
          title="Nenhum status configurado"
          hint="Os três de fábrica deveriam existir. Se a lista está vazia, avise antes de criar os seus."
        />
      ) : (
        <ul className="space-y-2">
          {statuses.map((status, index) => (
            <StatusRow
              key={status.id}
              status={status}
              isFirst={index === 0}
              isLast={index === statuses.length - 1}
            />
          ))}
        </ul>
      )}

      <p className="text-sm text-muted-foreground">
        <strong>Padrão</strong> é onde toda etapa nova começa — só um por vez.{" "}
        <strong>Conclui a etapa</strong> pode valer para vários: “Concluído” e
        “Não se aplica” ambos tiram a etapa do caminho, e é isso que o cálculo
        de progresso do processo enxerga.
      </p>
    </div>
  );
}
