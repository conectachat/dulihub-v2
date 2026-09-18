'use client';

/**
 * O editor das Observações do processo — estilo Notion, várias pessoas ao
 * mesmo tempo.
 *
 * Plate (componentes do registro, em `src/components/ui` e
 * `src/components/editor/plugins`) + Yjs pelo nosso provedor
 * (`src/features/pages/provedor-supabase.ts`). Carregado só no navegador,
 * pela aba (`next/dynamic`): o editor é pesado e nenhuma outra tela precisa
 * dele.
 *
 * Fora de propósito (18/set): IA, comentários e sugestões em trechos.
 */

import * as React from 'react';

import { registerProviderType, type YjsProviderConfig } from '@platejs/yjs';
import { YjsPlugin } from '@platejs/yjs/react';
import { Plate, usePlateEditor } from 'platejs/react';

import { AlignKit } from '@/components/editor/plugins/align-kit';
import { AutoformatKit } from '@/components/editor/plugins/autoformat-kit';
import { BasicNodesKit } from '@/components/editor/plugins/basic-nodes-kit';
import { BlockMenuKit } from '@/components/editor/plugins/block-menu-kit';
import { BlockPlaceholderKit } from '@/components/editor/plugins/block-placeholder-kit';
import { CalloutKit } from '@/components/editor/plugins/callout-kit';
import { CodeBlockKit } from '@/components/editor/plugins/code-block-kit';
import { ColumnKit } from '@/components/editor/plugins/column-kit';
import { CursorOverlayKit } from '@/components/editor/plugins/cursor-overlay-kit';
import { DateKit } from '@/components/editor/plugins/date-kit';
import { DndKit } from '@/components/editor/plugins/dnd-kit';
import { EmojiKit } from '@/components/editor/plugins/emoji-kit';
import { ExitBreakKit } from '@/components/editor/plugins/exit-break-kit';
import { FloatingToolbarKit } from '@/components/editor/plugins/floating-toolbar-kit';
import { FontKit } from '@/components/editor/plugins/font-kit';
import { LinkKit } from '@/components/editor/plugins/link-kit';
import { ListKit } from '@/components/editor/plugins/list-kit';
import { MarkdownKit } from '@/components/editor/plugins/markdown-kit';
import { MediaKit } from '@/components/editor/plugins/media-kit';
import { MentionKit } from '@/components/editor/plugins/mention-kit';
import { SlashKit } from '@/components/editor/plugins/slash-kit';
import { TableKit } from '@/components/editor/plugins/table-kit';
import { TocKit } from '@/components/editor/plugins/toc-kit';
import { ToggleKit } from '@/components/editor/plugins/toggle-kit';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { EquipeParaMencionar } from '@/components/ui/mention-node';
import { RemoteCursorOverlay } from '@/components/ui/remote-cursor-overlay';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  ProvedorSupabase,
  ganchosDasPaginas,
  type OpcoesDoProvedor,
} from '@/features/pages/provedor-supabase';
import type { Estado } from '@/features/pages/sincronia';
import { DestinoDoUpload } from '@/hooks/use-upload-file';

registerProviderType('supabase', ProvedorSupabase);

/** Cor fixa por pessoa: o cursor do Renato é sempre da mesma cor. */
const CORES = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
export function corDe(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return CORES[Math.abs(h) % CORES.length];
}

export type PresencaNaPagina = { id: string; nome: string; cor: string };

export default function ObservacoesEditor({
  paginaId,
  organizationId,
  projectId,
  usuario,
  equipe,
  aoMudarEstado,
  aoMudarPresenca,
}: {
  paginaId: string;
  organizationId: string;
  projectId: string;
  usuario: { id: string; nome: string };
  equipe: { id: string; nome: string }[];
  aoMudarEstado?: (e: Estado) => void;
  aoMudarPresenca?: (quem: PresencaNaPagina[]) => void;
}) {
  const opcoes: OpcoesDoProvedor = { paginaId, organizationId };
  const [aberto, setAberto] = React.useState(false);

  const editor = usePlateEditor(
    {
      plugins: [
        ...BasicNodesKit,
        ...CodeBlockKit,
        ...TableKit,
        ...ToggleKit,
        ...TocKit,
        ...MediaKit,
        ...CalloutKit,
        ...ColumnKit,
        ...DateKit,
        ...LinkKit,
        ...MentionKit,
        ...FontKit,
        ...ListKit,
        ...AlignKit,
        ...EmojiKit,
        ...SlashKit,
        ...AutoformatKit,
        ...ExitBreakKit,
        ...BlockMenuKit,
        ...DndKit,
        ...BlockPlaceholderKit,
        ...FloatingToolbarKit,
        ...MarkdownKit,
        ...CursorOverlayKit,
        YjsPlugin.configure({
          render: { afterEditable: RemoteCursorOverlay },
          options: {
            cursors: {
              data: { name: usuario.nome, color: corDe(usuario.id), id: usuario.id },
            },
            // O tipo só conhece os provedores do Plate; o nosso entra por
            // `registerProviderType` acima e é criado pelo plugin com o
            // documento, a presença e os avisos de sincronia dele.
            providers: [
              { type: 'supabase', options: opcoes } as unknown as YjsProviderConfig,
            ],
          },
        }),
      ],
      // O conteúdo vem do Yjs, não de um valor inicial.
      skipInitialization: true,
    },
    [paginaId]
  );

  React.useEffect(() => {
    ganchosDasPaginas.set(paginaId, {
      aoMudarEstado,
      conteudo: () => editor.children,
    });
  }, [paginaId, aoMudarEstado, editor]);

  React.useEffect(() => {
    const yjs = editor.getApi(YjsPlugin).yjs;
    // Falha ao abrir não pode passar calada: a página ficaria em branco,
    // parecendo vazia, com o texto no banco.
    // O conteúdo chega ao editor dentro do `init`, mas o Plate não se
    // redesenha sozinho: sem este estado a página abria em branco, com o
    // texto carregado por baixo (visto no teste de integração, 18/set).
    yjs.init({ id: paginaId }).then(() => setAberto(true)).catch((e: unknown) => {
      console.error('Observações: não abriu a página', e);
      ganchosDasPaginas.get(paginaId)?.aoMudarEstado?.('erro');
    });

    // Quem está na página, para os avatares do cabeçalho da aba.
    const presenca = editor.getOption(YjsPlugin, 'awareness');
    const avisar = () => {
      const pessoas = new Map<string, PresencaNaPagina>();
      for (const estado of presenca.getStates().values()) {
        const d = (estado as { data?: { id?: string; name?: string; color?: string } }).data;
        if (d?.id && d.name) pessoas.set(d.id, { id: d.id, nome: d.name, cor: d.color ?? '#999' });
      }
      aoMudarPresenca?.([...pessoas.values()]);
    };
    presenca.on('change', avisar);

    return () => {
      presenca.off('change', avisar);
      yjs.destroy();
      ganchosDasPaginas.delete(paginaId);
    };
    // `aoMudarPresenca` muda a cada renderização do pai; o efeito é por página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, paginaId]);

  return (
    <DestinoDoUpload.Provider value={{ organizationId, projectId }}>
      <EquipeParaMencionar.Provider value={equipe}>
        <TooltipProvider>
        <Plate editor={editor}>
          <EditorContainer className="min-h-[60vh] rounded-3xl bg-card">
            {aberto ? (
              <Editor
                variant="fullWidth"
                className="px-6 pt-6 pb-40 sm:px-14"
                placeholder="Digite '/' para comandos ou '@' para mencionar..."
              />
            ) : (
              <p className="px-6 pt-6 text-sm text-muted-foreground sm:px-14">
                Abrindo a página...
              </p>
            )}
          </EditorContainer>
        </Plate>
        </TooltipProvider>
      </EquipeParaMencionar.Provider>
    </DestinoDoUpload.Provider>
  );
}
