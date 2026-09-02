"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { File, Folder, Plus } from "lucide-react";

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
  toggleGroup,
  type DocTypeState,
} from "@/features/settings/document-type-actions";
import { flattenTree, indentStyle } from "@/lib/tree";

export type DocNode = {
  id: string;
  parent_id: string | null;
  name: string;
  is_group: boolean;
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

/** Formulário de criação, usado na raiz e dentro de um grupo. */
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
          placeholder="Ex.: Documentos pessoais, Passaporte"
          required
          className="h-9 min-w-48 flex-1 rounded-xl"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" name="is_group" className="h-3.5 w-3.5" />
          É um grupo
        </label>
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
          hint="Crie o primeiro grupo abaixo — por exemplo “Documentos pessoais”."
        />
      ) : (
        <ul className="space-y-1">
          {flat.map((node) => (
            <li key={node.id}>
              <div
                className="flex items-center gap-1 rounded-2xl border px-2 py-1"
                style={indentStyle(node.depth)}
              >
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

                <InlineText
                  action={renameDocumentType}
                  name="name"
                  value={node.name}
                  hidden={{ id: node.id }}
                  label={`Nome de ${node.name}`}
                  className="flex-1"
                />

                <form action={toggleGroup}>
                  <input type="hidden" name="id" value={node.id} />
                  <input type="hidden" name="is_group" value={String(node.is_group)} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-xl text-xs text-muted-foreground"
                    disabled={node.is_group && node.descendants > 0}
                    title={
                      node.is_group && node.descendants > 0
                        ? "Esvazie o grupo antes de transformá-lo em documento"
                        : undefined
                    }
                  >
                    {node.is_group ? "Grupo" : "Documento"}
                  </Button>
                </form>

                {node.is_group ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setAddingTo(addingTo === node.id ? null : node.id)}
                    aria-label={`Adicionar dentro de ${node.name}`}
                    aria-expanded={addingTo === node.id}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                ) : null}

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
                  consequence={`Isso apaga também os ${node.descendants} ${
                    node.descendants === 1 ? "item" : "itens"
                  } dentro dele. Tipos de visto que exigiam qualquer um deles perdem a exigência. Não dá para desfazer.`}
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
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded-3xl border border-dashed p-4">
        <Label className="text-sm font-medium">Novo item na raiz</Label>
        <CreateForm parentId={null} label="Criar" />
      </div>

      <p className="text-sm text-muted-foreground">
        <strong>Grupo</strong> organiza; <strong>documento</strong> é o que o
        cliente envia. Este catálogo é compartilhado: cada tipo de visto escolhe
        daqui o que exige, com prazo e obrigatoriedade próprios.
      </p>
    </div>
  );
}
