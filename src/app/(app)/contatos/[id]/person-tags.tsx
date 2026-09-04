"use client";

import Link from "next/link";
import { useRef } from "react";

import { setPersonTags } from "@/features/people/tag-actions";
import { comAviso } from "@/lib/avisar";
import { DEFAULT_COLOR } from "@/lib/palette";
import { cn } from "@/lib/utils";

type Tag = { id: string; name: string; color: string | null };

/**
 * Marcação de tags na ficha da pessoa.
 *
 * Cada tag é uma caixa de seleção estilizada como etiqueta. Marcar ou desmarcar
 * envia o conjunto inteiro — sem botão de salvar, porque numa tela de
 * classificação rápida o botão só somaria um clique.
 */
export function PersonTags({
  personId,
  allTags,
  selectedIds,
}: {
  personId: string;
  allTags: Tag[];
  selectedIds: string[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const selected = new Set(selectedIds);

  if (allTags.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma tag criada ainda.{" "}
        <Link href="/configuracoes/tags" className="underline">
          Criar a primeira
        </Link>
        .
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      action={comAviso(setPersonTags)}
      className="flex flex-wrap gap-2"
    >
      <input type="hidden" name="person_id" value={personId} />

      {allTags.map((tag) => {
        const isOn = selected.has(tag.id);
        const color = tag.color ?? DEFAULT_COLOR;

        return (
          <label
            key={tag.id}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              isOn
                ? "border-transparent text-white"
                : "border-dashed text-muted-foreground hover:text-foreground",
            )}
            style={isOn ? { backgroundColor: color } : undefined}
          >
            <input
              type="checkbox"
              name="tag_ids"
              value={tag.id}
              defaultChecked={isOn}
              onChange={() => formRef.current?.requestSubmit()}
              className="sr-only"
            />
            {!isOn ? (
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: color }}
                aria-hidden
              />
            ) : null}
            {tag.name}
          </label>
        );
      })}
    </form>
  );
}
