"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Folder, FolderOpen, Plus } from "lucide-react";

import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { InlineText } from "@/components/inline-text";
import { MoveButtons } from "@/components/move-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createDocumentType,
  deleteDocumentType,
  moveDocumentType,
  renameDocumentType,
  type DocTypeState,
} from "@/features/settings/document-type-actions";
import { flattenTree, indentStyle } from "@/lib/tree";

export type DocNode = {
  id: string;
  parent_id: string | null;
  name: string;
  position: number;
};

const initialState: DocTypeState = { error: null };

function AddButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Plus className="mr-1 h-4 w-4" />
      {pending ? "Criando..." : label}
    </Button>
  );
}

/** Formulário de criação, usado na raiz e dentro de qualquer pasta. */
function CreateForm({
  parentId,
  onDone,
  label,
}: {
  parentId: string | null;
  onDone?: () => void;
  label: string;
}) {
  const [state, formAction] = useActionState(createDocumentType, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      onDone?.();
    }
  }, [state.ok, onDone]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      {parentId ? <input type="hidden" name="parent_id" value={parentId} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="name"
          placeholder="Ex.: Rendimentos, Documentos pessoais"
          required
          className="h-9 min-w-48 flex-1 rounded-xl"
        />
        <AddButton label={label} />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function DocumentTypesEditor({ nodes }: { nodes: DocNode[] }) {
  const flat = flattenTree(nodes);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {flat.length === 0 ? (
        <EmptyState
          icon={Folder}
          title="Catálogo vazio"
          hint="Crie a primeira pasta abaixo — por exemplo “Documentos pessoais”."
        />
      ) : (
        <ul className="space-y-1">
          {flat.map((node) => {
            // Pasta cheia e pasta vazia se distinguem pelo que a árvore já
            // sabe. Não existe mais tipo de nó: toda pasta recebe arquivo.
            const Icon = node.descendants > 0 ? FolderOpen : Folder;

            return (
              <li key={node.id}>
                <div
                  className="flex items-center gap-1 rounded-2xl border px-2 py-1"
                  style={indentStyle(node.depth)}
                >
                  <Icon className="h-4 w-4 shrink-0 text-brand" aria-hidden />

                  <InlineText
                    action={renameDocumentType}
                    name="name"
                    value={node.name}
                    hidden={{ id: node.id }}
                    label={`Nome de ${node.name}`}
                    className="flex-1"
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-primary"
                    onClick={() => setAddingTo(addingTo === node.id ? null : node.id)}
                    aria-label={`Adicionar dentro de ${node.name}`}
                    aria-expanded={addingTo === node.id}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>

                  <MoveButtons
                    action={moveDocumentType}
                    hidden={{ id: node.id }}
                    label={node.name}
                    isFirst={node.isFirst}
                    isLast={node.isLast}
                  />

                  <ConfirmAction
                    action={deleteDocumentType}
                    hidden={{ id: node.id }}
                    title={`Excluir “${node.name}”?`}
                    consequence={`Isso apaga também as ${node.descendants} ${
                      node.descendants === 1 ? "pasta" : "pastas"
                    } dentro dela. Tipos de visto que exigiam qualquer uma delas perdem a exigência. Não dá para desfazer.`}
                    confirmLabel="Excluir tudo"
                    triggerLabel={`Excluir ${node.name}`}
                    needsConfirmation={node.descendants > 0}
                  />
                </div>

                {addingTo === node.id ? (
                  <div
                    className="mt-1 rounded-2xl border border-dashed p-2"
                    style={indentStyle(node.depth + 1)}
                  >
                    <CreateForm
                      parentId={node.id}
                      label="Adicionar"
                      onDone={() => setAddingTo(null)}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2 rounded-3xl border border-dashed p-4">
        <Label className="text-sm font-medium">Nova pasta na raiz</Label>
        <CreateForm parentId={null} label="Criar" />
      </div>

      <p className="text-sm text-muted-foreground">
        Toda pasta recebe arquivos e pode ter subpastas — não é preciso nomear
        cada documento de antemão. Este catálogo é compartilhado: cada tipo de
        visto escolhe daqui o que exige, com prazo e obrigatoriedade próprios.
      </p>
    </div>
  );
}
