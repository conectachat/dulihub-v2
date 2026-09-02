"use client";

import { File, Folder } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { InlineText } from "@/components/inline-text";
import { Button } from "@/components/ui/button";
import {
  toggleVisaDocument,
  updateVisaDocument,
} from "@/features/settings/visa-type-actions";
import { flattenTree, indentStyle } from "@/lib/tree";
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

export function VisaDocumentsEditor({
  visaTypeId,
  catalog,
  selections,
}: {
  visaTypeId: string;
  catalog: CatalogNode[];
  selections: Selection[];
}) {
  const flat = flattenTree(catalog);
  const byDocType = new Map(selections.map((s) => [s.document_type_id, s]));

  if (flat.length === 0) {
    return (
      <EmptyState
        icon={Folder}
        title="O catálogo está vazio"
        hint="Monte-o em Categorias de documento antes de definir o que este visto exige."
      />
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
                "flex items-center gap-2 rounded-2xl border px-2 py-1.5",
                isSelected ? "border-primary/40 bg-primary/5" : "border-transparent",
              )}
              style={indentStyle(node.depth)}
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
                <>
                  {/* Obrigatoriedade e prazo são do visto, não do catálogo. */}
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
                      className="h-8 rounded-xl text-xs"
                      title="Alternar entre obrigatório e opcional neste visto"
                    >
                      {selection.is_required ? "Obrigatório" : "Opcional"}
                    </Button>
                  </form>

                  <InlineText
                    action={updateVisaDocument}
                    name="deadline_days"
                    value={selection.deadline_days?.toString() ?? ""}
                    hidden={{ id: selection.id }}
                    label={`Prazo de ${node.name} em dias`}
                    placeholder="dias"
                    inputMode="numeric"
                    required={false}
                    className="w-16 shrink-0"
                  />
                </>
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
