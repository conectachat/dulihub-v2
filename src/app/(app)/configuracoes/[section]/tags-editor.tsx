"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  createTag,
  deleteTag,
  updateTag,
  TAG_COLORS,
  type TagActionState,
} from "@/features/settings/tag-actions";
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
  const nameFormRef = useRef<HTMLFormElement>(null);
  const colorFormRef = useRef<HTMLFormElement>(null);
  const [color, setColor] = useState(tag.color ?? FALLBACK_COLOR);
  const [confirming, setConfirming] = useState(false);

  const inUse = tag.person_count > 0;

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border p-3">
      <form ref={nameFormRef} action={updateTag} className="min-w-40 flex-1">
        <input type="hidden" name="id" value={tag.id} />
        <input type="hidden" name="color" value={color} />
        <Input
          name="name"
          defaultValue={tag.name}
          aria-label={`Nome da tag ${tag.name}`}
          onBlur={(e) => {
            if (e.target.value.trim() && e.target.value !== tag.name) {
              nameFormRef.current?.requestSubmit();
            }
          }}
          className="h-9 rounded-xl"
        />
      </form>

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
        {tag.person_count === 1 ? "1 contato" : `${tag.person_count} contatos`}
      </span>

      {inUse ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => setConfirming(true)}
            aria-label={`Excluir ${tag.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          <Dialog open={confirming} onOpenChange={setConfirming}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Excluir a tag “{tag.name}”?</DialogTitle>
                <DialogDescription>
                  Ela será removida de {tag.person_count}{" "}
                  {tag.person_count === 1 ? "contato" : "contatos"}. Os contatos
                  permanecem — perdem só esta marcação. Não dá para desfazer.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirming(false)}
                >
                  Cancelar
                </Button>
                <form action={deleteTag}>
                  <input type="hidden" name="id" value={tag.id} />
                  <Button type="submit" variant="destructive">
                    Excluir mesmo assim
                  </Button>
                </form>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <form action={deleteTag}>
          <input type="hidden" name="id" value={tag.id} />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={`Excluir ${tag.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </form>
      )}
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
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma tag ainda. Crie a primeira abaixo.
        </p>
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
        className="space-y-3 rounded-2xl border border-dashed p-4"
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
