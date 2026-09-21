"use client";

import { useActionState, useRef, useState } from "react";
import { CloudOff, Plus, Tag as TagIcon, TriangleAlert } from "lucide-react";

import { ESTADO_INICIAL } from "@/lib/action-state";
import { ColorPicker } from "@/components/color-picker";
import { ColorPickerPopover } from "@/components/color-picker-popover";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { InlineText } from "@/components/inline-text";
import { FieldError } from "@/components/field-error";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import {
  createTag,
  deleteTag,
  updateTag,
} from "@/features/settings/escritas-locais";
import { comAviso } from "@/lib/avisar";
import { DEFAULT_COLOR } from "@/lib/palette";

type Tag = {
  id: string;
  name: string;
  color: string | null;
  person_count: number;
  /** Gravada aqui e ainda não confirmada pelo servidor. */
  pendente?: boolean;
  /** Recusada pelo servidor: continua visível, com o motivo. */
  conflito?: string | null;
};


/** Nome e cor salvam sozinhos: nome ao sair do campo, cor ao escolher. */
function TagRow({ tag }: { tag: Tag }) {
  const colorFormRef = useRef<HTMLFormElement>(null);
  const [color, setColor] = useState(tag.color ?? DEFAULT_COLOR);

  const affected =
    tag.person_count === 1 ? "1 contato" : `${tag.person_count} contatos`;

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border p-3">
      <form ref={colorFormRef} action={comAviso(updateTag)} className="flex">
        <input type="hidden" name="id" value={tag.id} />
        <input type="hidden" name="name" value={tag.name} />
        <input type="hidden" name="color" value={color} />
        <ColorPickerPopover
          value={color}
          label={`Cor da tag ${tag.name}`}
          onChange={(next) => {
            setColor(next);
            // Espera o estado virar valor do campo antes de enviar.
            queueMicrotask(() => colorFormRef.current?.requestSubmit());
          }}
        />
      </form>

      {/* A cor viaja junto no rename para não ser apagada pela atualização. */}
      <InlineText
        action={updateTag}
        name="name"
        value={tag.name}
        hidden={{ id: tag.id, color }}
        label={`Nome da tag ${tag.name}`}
        className="min-w-40 flex-1"
      />

      <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
        {affected}
      </span>

      {/*
        O selo some sozinho quando o item sai da fila. Enquanto está aqui, a
        pessoa sabe que o servidor ainda não tem isso — e recusa nunca
        desaparece calada: fica em vermelho, com o motivo.
      */}
      {tag.conflito ? (
        <span
          className="flex shrink-0 items-center gap-1 text-xs text-destructive"
          title={tag.conflito}
        >
          <TriangleAlert className="h-3 w-3" />
          Não aceita
        </span>
      ) : tag.pendente ? (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <CloudOff className="h-3 w-3" />
          Só neste aparelho
        </span>
      ) : null}

      <ConfirmAction
        action={deleteTag}
        hidden={{ id: tag.id }}
        title={`Excluir a tag “${tag.name}”?`}
        consequence={`Ela será removida de ${affected}. Os contatos permanecem — perdem só esta marcação. Não dá para desfazer.`}
        confirmLabel="Excluir mesmo assim"
        triggerLabel={`Excluir ${tag.name}`}
        needsConfirmation={tag.person_count > 0}
      />
    </li>
  );
}

/**
 * Bloco de criação.
 *
 * Vive separado e é remontado pela `key` a cada sucesso: campo e cor voltam
 * ao inicial sem efeito nenhum limpando estado depois do fato.
 */
function CreateTagForm({ action }: { action: (formData: FormData) => void }) {
  const [newColor, setNewColor] = useState<string>(DEFAULT_COLOR);

  return (
    <form
      action={action}
      className="space-y-3 rounded-3xl border border-dashed p-4"
    >
      <div className="space-y-1">
        <label htmlFor="new-tag" className="text-sm font-medium">
          Nova tag
        </label>
        <Input
          id="new-tag"
          name="name"
          placeholder="Ex.: EB-1A, Indicação, Urgente"
          required
          className="rounded-xl"
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Cor</p>
        <ColorPicker
          name="color"
          label="Cor da nova tag"
          value={newColor}
          onChange={setNewColor}
        />
      </div>

      <SubmitButton pendente="Criando..." icone={<Plus className="h-4 w-4" />}>Criar tag</SubmitButton>
    </form>
  );
}

export function TagsEditor({ tags }: { tags: Tag[] }) {
  const [state, formAction] = useActionState(createTag, ESTADO_INICIAL);

  return (
    <div className="space-y-6">
      {/*
        Criar vem antes da lista de propósito: com a lista cheia, o campo no
        fim obrigaria a rolar até embaixo a cada tag nova.
      */}
      <CreateTagForm key={state.token ?? "novo"} action={formAction} />

      <FieldError mensagem={state.error} />

      {tags.length === 0 ? (
        <EmptyState
          icon={TagIcon}
          title="Nenhuma tag ainda"
          hint="Crie a primeira abaixo."
        />
      ) : (
        <ul className="space-y-2">
          {tags.map((tag) => (
            <TagRow key={tag.id} tag={tag} />
          ))}
        </ul>
      )}

      <p className="text-sm text-muted-foreground">
        Tags valem para a pessoa, não para o estágio dela. Uma marcação posta no
        contato continua lá quando ele virar oportunidade e depois cliente.
      </p>
    </div>
  );
}
