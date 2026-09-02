"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  File,
  Folder,
  Plus,
  Trash2,
} from "lucide-react";

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
import { Label } from "@/components/ui/label";
import {
  createDocumentType,
  deleteDocumentType,
  moveDocumentType,
  renameDocumentType,
  toggleGroup,
  type DocTypeState,
} from "@/features/settings/document-type-actions";

export type DocNode = {
  id: string;
  parent_id: string | null;
  name: string;
  is_group: boolean;
  position: number;
};

/** Nó já achatado para renderização, com profundidade e vizinhança. */
type FlatNode = DocNode & {
  depth: number;
  isFirst: boolean;
  isLast: boolean;
  descendants: number;
};

const initialState: DocTypeState = { error: null };

/**
 * Achata a árvore preservando a ordem de leitura.
 *
 * A tela desenha a hierarquia por recuo, não por painéis aninhados: é mais
 * simples de construir, e o recuo já comunica o nível.
 */
function flatten(nodes: DocNode[]): FlatNode[] {
  const byParent = new Map<string | null, DocNode[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parent_id) ?? [];
    list.push(node);
    byParent.set(node.parent_id, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.position - b.position);
  }

  const countDescendants = (id: string): number => {
    const children = byParent.get(id) ?? [];
    return children.reduce((sum, c) => sum + 1 + countDescendants(c.id), 0);
  };

  const out: FlatNode[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const siblings = byParent.get(parentId) ?? [];
    siblings.forEach((node, index) => {
      out.push({
        ...node,
        depth,
        isFirst: index === 0,
        isLast: index === siblings.length - 1,
        descendants: countDescendants(node.id),
      });
      walk(node.id, depth + 1);
    });
  };
  walk(null, 0);
  return out;
}

function AddButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Plus className="mr-1 h-4 w-4" />
      {pending ? "Criando..." : label}
    </Button>
  );
}

function NodeName({ node }: { node: FlatNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={renameDocumentType} className="min-w-0 flex-1">
      <input type="hidden" name="id" value={node.id} />
      <Input
        name="name"
        defaultValue={node.name}
        aria-label={`Nome de ${node.name}`}
        onBlur={(e) => {
          if (e.target.value.trim() && e.target.value !== node.name) {
            formRef.current?.requestSubmit();
          }
        }}
        className="h-8 rounded-xl border-0 bg-transparent px-2 hover:bg-muted focus-visible:bg-background"
      />
    </form>
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
  const flat = flatten(nodes);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<FlatNode | null>(null);

  return (
    <div className="space-y-6">
      {flat.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Catálogo vazio. Crie o primeiro grupo abaixo — por exemplo
          &ldquo;Documentos pessoais&rdquo;.
        </p>
      ) : (
        <ul className="space-y-1">
          {flat.map((node) => (
            <li key={node.id}>
              <div
                className="flex items-center gap-1 rounded-xl border px-2 py-1"
                style={{ marginLeft: `${node.depth * 1.5}rem` }}
              >
                <span
                  className={
                    node.is_group ? "text-brand" : "text-muted-foreground"
                  }
                  aria-hidden
                >
                  {node.is_group ? (
                    <Folder className="h-4 w-4" />
                  ) : (
                    <File className="h-4 w-4" />
                  )}
                </span>

                <NodeName node={node} />

                <form action={toggleGroup}>
                  <input type="hidden" name="id" value={node.id} />
                  <input
                    type="hidden"
                    name="is_group"
                    value={String(node.is_group)}
                  />
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
                    onClick={() =>
                      setAddingTo(addingTo === node.id ? null : node.id)
                    }
                    aria-label={`Adicionar dentro de ${node.name}`}
                    aria-expanded={addingTo === node.id}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                ) : null}

                <form action={moveDocumentType}>
                  <input type="hidden" name="id" value={node.id} />
                  <input type="hidden" name="direction" value="up" />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={node.isFirst}
                    aria-label={`Subir ${node.name}`}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                </form>

                <form action={moveDocumentType}>
                  <input type="hidden" name="id" value={node.id} />
                  <input type="hidden" name="direction" value="down" />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={node.isLast}
                    aria-label={`Descer ${node.name}`}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </form>

                {node.descendants > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirming(node)}
                    aria-label={`Excluir ${node.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : (
                  <form action={deleteDocumentType}>
                    <input type="hidden" name="id" value={node.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      aria-label={`Excluir ${node.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </form>
                )}
              </div>

              {addingTo === node.id ? (
                <div
                  className="mt-1 rounded-xl border border-dashed p-2"
                  style={{ marginLeft: `${(node.depth + 1) * 1.5}rem` }}
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

      <div className="space-y-2 rounded-2xl border border-dashed p-4">
        <Label className="text-sm font-medium">Novo item na raiz</Label>
        <CreateForm parentId={null} label="Criar" />
      </div>

      <p className="text-sm text-muted-foreground">
        <strong>Grupo</strong> organiza; <strong>documento</strong> é o que o
        cliente envia. Este catálogo é compartilhado: cada tipo de visto escolhe
        daqui o que exige, com prazo e obrigatoriedade próprios.
      </p>

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir &ldquo;{confirming?.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              Isso apaga também os {confirming?.descendants}{" "}
              {confirming?.descendants === 1 ? "item" : "itens"} dentro dele.
              Tipos de visto que exigiam qualquer um deles perdem a exigência.
              Não dá para desfazer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirming(null)}
            >
              Cancelar
            </Button>
            <form action={deleteDocumentType}>
              <input type="hidden" name="id" value={confirming?.id ?? ""} />
              <Button type="submit" variant="destructive">
                Excluir tudo
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
