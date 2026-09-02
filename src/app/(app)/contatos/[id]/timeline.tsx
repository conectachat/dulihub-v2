"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  ArrowRightLeft,
  CalendarDays,
  History,
  Mail,
  MessageSquare,
  Phone,
  StickyNote,
  Trash2,
  Users,
} from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createEntry,
  deleteEntry,
  type TimelineActionState,
} from "@/features/people/timeline-actions";
import type { TimelineItem } from "@/features/people/timeline-queries";
import { cn } from "@/lib/utils";

const TYPES = [
  { value: "note", label: "Nota", icon: StickyNote },
  { value: "call", label: "Ligação", icon: Phone },
  { value: "meeting", label: "Reunião", icon: Users },
  { value: "email", label: "Email", icon: Mail },
  { value: "other", label: "Outro", icon: MessageSquare },
] as const;

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  note: StickyNote,
  call: Phone,
  meeting: Users,
  email: Mail,
  other: MessageSquare,
  stage_change: ArrowRightLeft,
};

const LABELS: Record<string, string> = {
  note: "Nota",
  call: "Ligação",
  meeting: "Reunião",
  email: "Email",
  other: "Outro",
  stage_change: "Movimento no funil",
};

const initialState: TimelineActionState = { error: null };

const when = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando..." : "Registrar"}
    </Button>
  );
}

export function Timeline({
  personId,
  items,
  currentUserId,
}: {
  personId: string;
  items: TimelineItem[];
  currentUserId: string | null;
}) {
  const [state, formAction] = useActionState(createEntry, initialState);
  const [type, setType] = useState<string>("note");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setType("note");
    }
  }, [state.ok]);

  const isNote = type === "note";

  return (
    <div className="space-y-6">
      <form ref={formRef} action={formAction} className="space-y-3">
        <input type="hidden" name="person_id" value={personId} />
        <input type="hidden" name="type" value={type} />

        <textarea
          name="body"
          required
          rows={3}
          placeholder={
            isNote
              ? "O que vale registrar sobre esta pessoa?"
              : "O que foi conversado?"
          }
          className="w-full resize-y rounded-2xl border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {TYPES.map((t) => {
              const Icon = t.icon;
              const active = type === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Nota é sempre do agora. Atividade pode ser lançada depois. */}
          {!isNote ? (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="sr-only">Quando aconteceu</span>
              <Input
                type="datetime-local"
                name="occurred_at"
                className="h-8 w-auto rounded-xl text-xs"
              />
            </label>
          ) : null}

          <div className="ml-auto">
            <SubmitButton />
          </div>
        </div>

        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </form>

      {items.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nada registrado ainda"
          hint="Movimentos no funil aparecem aqui automaticamente."
        />
      ) : (
        <ol className="space-y-3">
          {items.map((item) => {
            const Icon = ICONS[item.type] ?? MessageSquare;
            const canDelete = !item.system && item.authorId === currentUserId;

            return (
              <li key={`${item.kind}-${item.id}`} className="flex gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                    item.system
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary/10 text-primary",
                  )}
                  aria-hidden
                >
                  <Icon className="h-4 w-4" />
                </span>

                <div className="min-w-0 flex-1 rounded-2xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {LABELS[item.type] ?? item.type}
                      {item.authorName ? ` · ${item.authorName}` : ""} ·{" "}
                      {when.format(new Date(item.occurredAt))}
                    </p>

                    {canDelete ? (
                      <form action={deleteEntry}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="kind" value={item.kind} />
                        <input type="hidden" name="person_id" value={personId} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label="Excluir registro"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </form>
                    ) : null}
                  </div>

                  {item.body ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm">{item.body}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
