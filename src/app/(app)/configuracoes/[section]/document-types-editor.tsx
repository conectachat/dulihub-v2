"use client";

import { useActionState, useState } from "react";
import { Folder, FolderOpen, Plus } from "lucide-react";

import { ESTADO_INICIAL } from "@/lib/action-state";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { InlineText } from "@/components/inline-text";
import { MoveButtons } from "@/components/move-buttons";
import { SeloPendente } from "@/components/selo-pendente";
import { FieldError } from "@/components/field-error";
import { SubmitButton } from "@/components/submit-button";
import { AddChildButton, TreeRow } from "@/components/tree-row";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createDocumentType,
  deleteDocumentType,
  moveDocumentType,
  renameDocumentType,
} from "@/features/settings/escritas-locais";
import { avisoDeExclusaoDePasta } from "@/lib/avisos";
import { flattenTree } from "@/lib/tree";

export type DocNode = {
  id: string;
  parent_id: string | null;
  name: string;
  position: number;
  /** Gravada aqui e ainda não confirmada pelo servidor. */
  pendente?: boolean;
  /** Recusada pelo servidor: continua visível, com o motivo. */
  conflito?: string | null;
};

/** Formulário de criação, usado na raiz e dentro de qualquer pasta. */
function CreateForm({
  parentId,
  label,
}: {
  parentId: string | null;
  label: string;
}) {
  const [state, formAction] = useActionState(createDocumentType, ESTADO_INICIAL);

  return (
    // O `key` é o que limpa o campo depois de gravar. O `useEffect(...,
    // [state.ok])` que estava aqui só funcionava na primeira vez: `ok`
    // continua verdadeiro depois do primeiro sucesso, o efeito não roda de
    // novo, e a segunda pasta criada deixava o nome digitado no campo.
    // O painel de subpasta também deixou de fechar sozinho — quem abre para
    // criar uma subpasta costuma criar duas ou três seguidas.
    <form
      key={state.token ?? "novo"}
      action={formAction}
      className="space-y-2"
    >
      {parentId ? <input type="hidden" name="parent_id" value={parentId} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="name"
          placeholder="Ex.: Rendimentos, Documentos pessoais"
          required
          className="h-9 min-w-48 flex-1 rounded-xl"
        />
        <SubmitButton pendente="Criando..." size="sm" icone={<Plus className="h-4 w-4" />}>{label}</SubmitButton>
      </div>
      <FieldError mensagem={state.error} />
    </form>
  );
}

export function DocumentTypesEditor({
  nodes,
  usos = {},
}: {
  nodes: DocNode[];
  /**
   * Que tipos de visto exigem cada pasta, por id da pasta.
   *
   * Serve ao aviso de exclusão, e é ele que justifica a consulta a mais:
   * `visa_type_documents` tem cascade, então apagar uma pasta tira em silêncio
   * a exigência, o prazo e a obrigatoriedade dos vistos que a usavam.
   */
  usos?: Record<string, string[]>;
}) {
  const flat = flattenTree(nodes);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  /** A cascata desce a subárvore inteira, então o aviso conta ela inteira. */
  const vistosAfetados = (id: string, descendentes: string[]) => {
    const nomes = new Set<string>();
    for (const alvo of [id, ...descendentes]) {
      for (const nome of usos[alvo] ?? []) nomes.add(nome);
    }
    return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
  };

  return (
    <div className="space-y-6">
      {/*
        Criar vem antes da lista de propósito: com o catálogo cheio, o campo no
        fim obrigaria a rolar até embaixo a cada pasta nova.
      */}
      <div className="space-y-2 rounded-3xl border border-dashed p-4">
        <Label className="text-sm font-medium">Nova pasta na raiz</Label>
        <CreateForm parentId={null} label="Criar" />
      </div>

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
            const Icon = node.descendantIds.length > 0 ? FolderOpen : Folder;

            return (
              <li key={node.id}>
                <TreeRow
                  depth={node.depth}
                  aberto={addingTo === node.id}
                  painel={<CreateForm parentId={node.id} label="Adicionar" />}
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

                  <SeloPendente pendente={node.pendente} conflito={node.conflito} />

                  <AddChildButton
                    aberto={addingTo === node.id}
                    onToggle={() =>
                      setAddingTo(addingTo === node.id ? null : node.id)
                    }
                    rotulo={`Adicionar dentro de ${node.name}`}
                  />

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
                    consequence={avisoDeExclusaoDePasta({
                      pastas: node.descendantIds.length,
                      vistos: vistosAfetados(node.id, node.descendantIds),
                    })}
                    confirmLabel="Excluir"
                    triggerLabel={`Excluir ${node.name}`}
                  />
                </TreeRow>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-sm text-muted-foreground">
        Toda pasta recebe arquivos e pode ter subpastas — não é preciso nomear
        cada documento de antemão. Este catálogo é compartilhado: cada tipo de
        visto escolhe daqui o que exige, com prazo e obrigatoriedade próprios.
      </p>
    </div>
  );
}
