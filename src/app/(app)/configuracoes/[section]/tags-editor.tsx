"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Tag as TagIcon } from "lucide-react";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { InlineText } from "@/components/inline-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createTag,
  deleteTag,
  updateTag,
  type TagActionState,
} from "@/features/settings/tag-actions";
import { TAG_COLORS } from "@/features/settings/tag-colors";
import { cn } from "@/lib/utils";

type Tag = {
  id: string;
  name: string;
  color: string | null;
  person_count: number;
};

const initialState: TagActionState = { error: null };
const FALLBACK_COLOR = TAG_COLORS[0];

function ColorPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange?: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cor da tag">
      {TAG_COLORS.map((color) => (
        <label
          key={color}
          className={cn(
            "h-6 w-6 cursor-pointer rounded-full ring-offset-2 ring-offset-background transition-shadow",
            value === color && "ring-2 ring-foreground",
          )}
          style={{ backgroundColor: color }}
        >
          <input
            type="radio"
            name={name}
            value={color}
            checked={value === color}
            onChange={() => onChange?.(color)}
            className="sr-only"
          />
          <span className="sr-only">{color}</span>
        </label>
      ))}
    </div>
  );
}

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Plus className="mr-1 h-4 w-4" />
      {pending ? "Criando..." : "Criar tag"}
    </Button>
  );
}

/** Nome e cor salvam sozinhos: nome ao sair do campo, cor ao escolher. */
function TagRow({ tag }: { tag: Tag }) {
  const colorFormRef = useRef<HTMLFormElement>(null);
  const [color, setColor] = useState(tag.color ?? FALLBACK_COLOR);

  const affected =
    tag.person_count === 1 ? "1 contato" : `${tag.person_count} contatos`;

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border p-3">
      {/* A cor viaja junto no rename para não ser apagada pela atualização. */}
      <InlineText
        action={updateTag}
        name="name"
        value={tag.name}
        hidden={{ id: tag.id, color }}
        label={`Nome da tag ${tag.name}`}
        className="min-w-40 flex-1"
      />

      <form ref={colorFormRef} action={updateTag}>
        <input type="hidden" name="id" value={tag.id} />
        <input type="hidden" name="name" value={tag.name} />
        <ColorPicker
          name="color"
          value={color}
          onChange={(next) => {
            setColor(next);
            // Espera o estado virar valor do campo antes de enviar.
            queueMicrotask(() => colorFormRef.current?.requestSubmit());
          }}
        />
      </form>

      <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
        {affected}
      </span>

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

export function TagsEditor({ tags }: { tags: Tag[] }) {
  const [state, formAction] = useActionState(createTag, initialState);
  const [newColor, setNewColor] = useState<string>(FALLBACK_COLOR);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setNewColor(FALLBACK_COLOR);
    }
  }, [state.ok]);

  return (
    <div className="space-y-6">
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

      <form
        ref={formRef}
        action={formAction}
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
          <ColorPicker name="color" value={newColor} onChange={setNewColor} />
        </div>

        <CreateButton />
      </form>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Tags valem para a pessoa, não para o estágio dela. Uma marcação posta no
        contato continua lá quando ele virar oportunidade e depois cliente.
      </p>
    </div>
  );
}
