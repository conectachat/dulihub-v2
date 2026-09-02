"use client";

import { useState } from "react";
import { Folder, FolderOpen } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { InlineText } from "@/components/inline-text";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  toggleVisaDocument,
  updateVisaDocument,
} from "@/features/settings/visa-type-actions";
import { flattenTree, indentStyle, type Flattened } from "@/lib/tree";
import { cn } from "@/lib/utils";

export type CatalogNode = {
  id: string;
  parent_id: string | null;
  name: string;
  position: number;
};

export type Selection = {
  id: string;
  document_type_id: string;
  is_required: boolean;
  deadline_days: number | null;
};

/**
 * Caixa de seleção da pasta.
 *
 * Marcar e desmarcar alcançam tudo que está dentro. Desmarcar por isso pede
 * confirmação quando há descendentes selecionados: cada linha perdida leva
 * junto a obrigatoriedade e o prazo que alguém ajustou à mão, e não há desfazer.
 */
function SelectBox({
  visaTypeId,
  node,
  isSelected,
  losing,
}: {
  visaTypeId: string;
  node: Flattened<CatalogNode>;
  isSelected: boolean;
  losing: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const needsConfirmation = isSelected && losing > 1;

  const fields = (
    <>
      <input type="hidden" name="visa_type_id" value={visaTypeId} />
      <input type="hidden" name="document_type_id" value={node.id} />
      <input type="hidden" name="selected" value={String(isSelected)} />
    </>
  );

  const box = cn(
    "flex h-4 w-4 items-center justify-center rounded border text-[10px]",
    isSelected
      ? "border-primary bg-primary text-primary-foreground"
      : "border-muted-foreground/40",
  );

  const label = `${isSelected ? "Remover" : "Exigir"} ${node.name}`;

  if (!needsConfirmation) {
    return (
      <form action={toggleVisaDocument} className="flex items-center">
        {fields}
        <button
          type="submit"
          role="checkbox"
          aria-checked={isSelected}
          aria-label={label}
          className={box}
        >
          {isSelected ? "✓" : ""}
        </button>
      </form>
    );
  }

  return (
    <>
      <button
        type="button"
        role="checkbox"
        aria-checked={isSelected}
        aria-label={label}
        className={box}
        onClick={() => setConfirming(true)}
      >
        ✓
      </button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remover “{node.name}” deste visto?</DialogTitle>
            <DialogDescription>
              Saem {losing} exigências ao todo — esta e as {losing - 1} de
              dentro dela. A obrigatoriedade e o prazo de cada uma se perdem, e
              não dá para desfazer. O catálogo não é tocado.
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
            <form action={toggleVisaDocument}>
              {fields}
              <Button type="submit" variant="destructive">
                Remover as {losing}
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

  // Quantas exigências some ao desmarcar cada pasta: ela mais as de dentro que
  // também estão marcadas.
  const childrenOf = new Map<string, string[]>();
  for (const node of catalog) {
    if (!node.parent_id) continue;
    childrenOf.set(node.parent_id, [
      ...(childrenOf.get(node.parent_id) ?? []),
      node.id,
    ]);
  }
  const countSelected = (id: string): number =>
    (byDocType.has(id) ? 1 : 0) +
    (childrenOf.get(id) ?? []).reduce((sum, child) => sum + countSelected(child), 0);

  return (
    <div className="space-y-4">
      <ul className="space-y-1">
        {flat.map((node) => {
          const selection = byDocType.get(node.id);
          const isSelected = Boolean(selection);
          const Icon = node.descendants > 0 ? FolderOpen : Folder;

          return (
            <li
              key={node.id}
              className={cn(
                "flex items-center gap-2 rounded-2xl border px-2 py-1.5",
                isSelected ? "border-primary/40 bg-primary/5" : "border-transparent",
              )}
              style={indentStyle(node.depth)}
            >
              <SelectBox
                visaTypeId={visaTypeId}
                node={node}
                isSelected={isSelected}
                losing={countSelected(node.id)}
              />

              <Icon className="h-4 w-4 shrink-0 text-brand" aria-hidden />

              <span className="min-w-0 flex-1 truncate text-sm">{node.name}</span>

              {selection ? (
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
                      className={cn(
                        "h-8 rounded-xl text-xs",
                        selection.is_required ? "text-primary" : "text-muted-foreground",
                      )}
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
        Marcar uma pasta marca tudo dentro dela — e desmarcar também. A seleção
        é gravada pasta por pasta: acrescentar pasta ao catálogo depois não muda
        o que este visto já exigia. Obrigatoriedade e prazo valem só para este
        visto.
      </p>
    </div>
  );
}
