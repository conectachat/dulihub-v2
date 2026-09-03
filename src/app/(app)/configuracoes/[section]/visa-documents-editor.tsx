"use client";

import { useState } from "react";
import { Folder, FolderOpen } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { InlineText } from "@/components/inline-text";
import { MoveButtons } from "@/components/move-buttons";
import { SectionHeader } from "@/components/page-header";
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
  moveVisaDocument,
  toggleVisaDocument,
  updateVisaDocument,
} from "@/features/settings/visa-type-actions";
import { flattenTree, indentStyle } from "@/lib/tree";
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
  position: number;
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
  id,
  name,
  isSelected,
  losing,
}: {
  visaTypeId: string;
  id: string;
  name: string;
  isSelected: boolean;
  losing: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const needsConfirmation = isSelected && losing > 1;

  const fields = (
    <>
      <input type="hidden" name="visa_type_id" value={visaTypeId} />
      <input type="hidden" name="document_type_id" value={id} />
      <input type="hidden" name="selected" value={String(isSelected)} />
    </>
  );

  const box = cn(
    "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
    isSelected
      ? "border-primary bg-primary text-primary-foreground"
      : "border-muted-foreground/40",
  );

  const label = `${isSelected ? "Remover" : "Exigir"} ${name}`;

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
            <DialogTitle>Remover “{name}” deste visto?</DialogTitle>
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
  const byDocType = new Map(selections.map((s) => [s.document_type_id, s]));
  const nameOf = new Map(catalog.map((n) => [n.id, n.name]));
  const parentOf = new Map(catalog.map((n) => [n.id, n.parent_id]));

  /**
   * Pai visível: sobe até achar um ancestral que este visto também exige.
   *
   * Marcar um filho sem o pai é possível, e sem isto ele sumiria da lista —
   * `flattenTree` começa da raiz e nunca alcançaria um nó pendurado em alguém
   * que não está ali.
   */
  const visibleParent = (docTypeId: string): string | null => {
    let cursor = parentOf.get(docTypeId) ?? null;
    while (cursor && !byDocType.has(cursor)) cursor = parentOf.get(cursor) ?? null;
    return cursor;
  };

  // A árvore do que é exigido usa a ordem DO VISTO, não a do catálogo.
  const required = flattenTree(
    selections.map((s) => ({
      id: s.document_type_id,
      parent_id: visibleParent(s.document_type_id),
      position: s.position,
      selection: s,
      name: nameOf.get(s.document_type_id) ?? "—",
    })),
  );

  const catalogTree = flattenTree(catalog);

  // Quantas exigências somem ao desmarcar cada pasta: ela e as de dentro que
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

  if (catalogTree.length === 0) {
    return (
      <EmptyState
        icon={Folder}
        title="O catálogo está vazio"
        hint="Monte-o em Categorias de documento antes de definir o que este visto exige."
      />
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionHeader
          title="Exigidos neste visto"
          description="Nesta ordem, e é assim que o cliente verá no processo. As setas organizam."
        />

        {required.length === 0 ? (
          <EmptyState
            title="Nada exigido ainda"
            hint="Marque abaixo, no catálogo, o que este visto pede."
            size="compact"
          />
        ) : (
          <ul className="space-y-1">
            {required.map((node) => {
              const Icon = node.descendants > 0 ? FolderOpen : Folder;

              return (
                <li
                  key={node.id}
                  className="flex items-center gap-2 rounded-2xl border px-2 py-1.5"
                  style={indentStyle(node.depth)}
                >
                  <Icon className="h-4 w-4 shrink-0 text-brand" aria-hidden />

                  <span className="min-w-0 flex-1 truncate text-sm">
                    {node.name}
                  </span>

                  {/* Obrigatoriedade e prazo são do visto, não do catálogo. */}
                  <form action={updateVisaDocument}>
                    <input type="hidden" name="id" value={node.selection.id} />
                    <input
                      type="hidden"
                      name="is_required"
                      value={String(!node.selection.is_required)}
                    />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-8 rounded-xl text-xs",
                        node.selection.is_required
                          ? "text-primary"
                          : "text-muted-foreground",
                      )}
                      title="Alternar entre obrigatório e opcional neste visto"
                    >
                      {node.selection.is_required ? "Obrigatório" : "Opcional"}
                    </Button>
                  </form>

                  <InlineText
                    action={updateVisaDocument}
                    name="deadline_days"
                    value={node.selection.deadline_days?.toString() ?? ""}
                    hidden={{ id: node.selection.id }}
                    label={`Prazo de ${node.name} em dias`}
                    placeholder="dias"
                    inputMode="numeric"
                    required={false}
                    className="w-16 shrink-0"
                  />

                  <div className="flex shrink-0 items-center gap-0.5">
                    <MoveButtons
                      action={moveVisaDocument}
                      hidden={{ id: node.selection.id }}
                      label={node.name}
                      isFirst={node.isFirst}
                      isLast={node.isLast}
                    />
                    <SelectBox
                      visaTypeId={visaTypeId}
                      id={node.id}
                      name={node.name}
                      isSelected
                      losing={countSelected(node.id)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Catálogo"
          description="Marque o que este visto exige. Marcar uma pasta alcança tudo dentro dela — e desmarcar também."
        />

        <ul className="space-y-1">
          {catalogTree.map((node) => {
            const isSelected = byDocType.has(node.id);
            const Icon = node.descendants > 0 ? FolderOpen : Folder;

            return (
              <li
                key={node.id}
                className={cn(
                  "flex items-center gap-2 rounded-2xl border px-2 py-1.5",
                  isSelected
                    ? "border-primary/40 bg-primary/5"
                    : "border-transparent",
                )}
                style={indentStyle(node.depth)}
              >
                <SelectBox
                  visaTypeId={visaTypeId}
                  id={node.id}
                  name={node.name}
                  isSelected={isSelected}
                  losing={countSelected(node.id)}
                />

                <Icon className="h-4 w-4 shrink-0 text-brand" aria-hidden />

                <span className="min-w-0 flex-1 truncate text-sm">{node.name}</span>
              </li>
            );
          })}
        </ul>

        <p className="text-sm text-muted-foreground">
          A seleção é gravada pasta por pasta: acrescentar pasta ao catálogo
          depois não muda o que este visto já exigia.
        </p>
      </section>
    </div>
  );
}
