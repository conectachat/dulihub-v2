"use client";

import { useRef } from "react";
import { File, Folder } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  toggleVisaDocument,
  updateVisaDocument,
} from "@/features/settings/visa-type-actions";
import { cn } from "@/lib/utils";

export type CatalogNode = {
  id: string;
  parent_id: string | null;
  name: string;
  is_group: boolean;
  position: number;
};

export type Selection = {
  id: string;
  document_type_id: string;
  is_required: boolean;
  deadline_days: number | null;
};

type FlatNode = CatalogNode & { depth: number };

function flatten(nodes: CatalogNode[]): FlatNode[] {
  const byParent = new Map<string | null, CatalogNode[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parent_id) ?? [];
    list.push(node);
    byParent.set(node.parent_id, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.position - b.position);

  const out: FlatNode[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const node of byParent.get(parentId) ?? []) {
      out.push({ ...node, depth });
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Obrigatoriedade e prazo são do visto, não do catálogo. */
function SelectionFields({ selection }: { selection: Selection }) {
  const daysRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form action={updateVisaDocument}>
        <input type="hidden" name="id" value={selection.id} />
        <input
          type="hidden"
          name="is_required"
          value={String(!selection.is_required)}
        />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="h-7 rounded-xl text-xs"
          title="Alternar entre obrigatório e opcional neste visto"
        >
          {selection.is_required ? "Obrigatório" : "Opcional"}
        </Button>
      </form>

      <form ref={daysRef} action={updateVisaDocument}>
        <input type="hidden" name="id" value={selection.id} />
        <Input
          name="deadline_days"
          inputMode="numeric"
          placeholder="dias"
          defaultValue={selection.deadline_days?.toString() ?? ""}
          aria-label="Prazo em dias"
          onBlur={(e) => {
            const current = selection.deadline_days?.toString() ?? "";
            if (e.target.value !== current) daysRef.current?.requestSubmit();
          }}
          className="h-7 w-16 rounded-xl text-center text-xs"
        />
      </form>
    </>
  );
}

export function VisaDocumentsEditor({
  visaTypeId,
  catalog,
  selections,
}: {
  visaTypeId: string;
  catalog: CatalogNode[];
  selections: Selection[];
}) {
  const flat = flatten(catalog);
  const byDocType = new Map(selections.map((s) => [s.document_type_id, s]));

  if (flat.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        O catálogo está vazio. Monte-o em <strong>Categorias de documento</strong>{" "}
        antes de definir o que este visto exige.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-1">
        {flat.map((node) => {
          const selection = byDocType.get(node.id);
          const isSelected = Boolean(selection);

          return (
            <li
              key={node.id}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-2 py-1.5",
                isSelected ? "border-primary/40 bg-primary/5" : "border-transparent",
              )}
              style={{ marginLeft: `${node.depth * 1.5}rem` }}
            >
              <form action={toggleVisaDocument} className="flex items-center">
                <input type="hidden" name="visa_type_id" value={visaTypeId} />
                <input type="hidden" name="document_type_id" value={node.id} />
                <input type="hidden" name="selected" value={String(isSelected)} />
                <button
                  type="submit"
                  role="checkbox"
                  aria-checked={isSelected}
                  aria-label={`${isSelected ? "Remover" : "Exigir"} ${node.name}`}
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded border text-[10px]",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/40",
                  )}
                >
                  {isSelected ? "✓" : ""}
                </button>
              </form>

              <span
                className={node.is_group ? "text-brand" : "text-muted-foreground"}
                aria-hidden
              >
                {node.is_group ? (
                  <Folder className="h-4 w-4" />
                ) : (
                  <File className="h-4 w-4" />
                )}
              </span>

              <span className="min-w-0 flex-1 truncate text-sm">{node.name}</span>

              {selection && !node.is_group ? (
                <SelectionFields selection={selection} />
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="text-sm text-muted-foreground">
        Marcar um grupo marca tudo dentro dele. A seleção é gravada item por
        item — acrescentar documento ao catálogo depois não muda o que este
        visto já exigia. Obrigatoriedade e prazo valem só para este visto.
      </p>
    </div>
  );
}
