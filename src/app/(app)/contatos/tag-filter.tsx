"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Tag as TagIcon, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Tag = { id: string; name: string; color: string | null };

/**
 * Filtro por tag, guardado na URL como os demais filtros da lista.
 *
 * Estado na URL e não no componente: sobrevive a recarregar, vira link
 * compartilhável, e a filtragem continua acontecendo no servidor — contato que
 * o filtro escondeu não chega ao navegador.
 */
export function TagFilter({ tags }: { tags: Tag[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const active = new Set(
    (params.get("tags") ?? "").split(",").filter(Boolean),
  );

  function apply(next: Set<string>) {
    const sp = new URLSearchParams(params.toString());
    if (next.size) sp.set("tags", [...next].join(","));
    else sp.delete("tags");
    startTransition(() => router.push(`/contatos?${sp.toString()}`));
  }

  function toggle(id: string) {
    const next = new Set(active);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  }

  if (tags.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="rounded-2xl">
            <TagIcon className="mr-1 h-4 w-4" />
            Tags
            {active.size > 0 ? (
              <span className="ml-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] text-primary-foreground">
                {active.size}
              </span>
            ) : null}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56 rounded-2xl">
          {tags.map((tag) => {
            const on = active.has(tag.id);
            return (
              <DropdownMenuItem
                key={tag.id}
                // Sem fechar ao clicar: filtrar por duas tags é comum, e
                // reabrir o menu a cada escolha seria irritante.
                onSelect={(e) => {
                  e.preventDefault();
                  toggle(tag.id);
                }}
                className="gap-2 rounded-xl"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color ?? "#64748b" }}
                  aria-hidden
                />
                <span className="flex-1 truncate">{tag.name}</span>
                <Check
                  className={cn("h-4 w-4", on ? "opacity-100" : "opacity-0")}
                />
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {active.size > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="rounded-2xl text-muted-foreground"
          onClick={() => apply(new Set())}
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Limpar
        </Button>
      ) : null}
    </div>
  );
}
