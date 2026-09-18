'use client';

/**
 * Barra que aparece ao selecionar texto — o jeito Notion de formatar, sem
 * barra fixa no topo. Veio do registro do Plate; traduzida e enxugada para as
 * Observações (18/set): sem IA, comentários, sugestões e equação.
 */

import * as React from 'react';

import {
  BaselineIcon,
  BoldIcon,
  Code2Icon,
  HighlighterIcon,
  ItalicIcon,
  PaintBucketIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from 'lucide-react';
import { KEYS } from 'platejs';
import { useEditorReadOnly } from 'platejs/react';

import { FontColorToolbarButton } from './font-color-toolbar-button';
import { LinkToolbarButton } from './link-toolbar-button';
import { MarkToolbarButton } from './mark-toolbar-button';
import { ToolbarGroup } from './toolbar';
import { TurnIntoToolbarButton } from './turn-into-toolbar-button';

export function FloatingToolbarButtons() {
  const readOnly = useEditorReadOnly();
  if (readOnly) return null;

  return (
    <>
      <ToolbarGroup>
        <TurnIntoToolbarButton />
      </ToolbarGroup>

      <ToolbarGroup>
        <MarkToolbarButton nodeType={KEYS.bold} tooltip="Negrito (Ctrl+B)">
          <BoldIcon />
        </MarkToolbarButton>
        <MarkToolbarButton nodeType={KEYS.italic} tooltip="Itálico (Ctrl+I)">
          <ItalicIcon />
        </MarkToolbarButton>
        <MarkToolbarButton nodeType={KEYS.underline} tooltip="Sublinhado (Ctrl+U)">
          <UnderlineIcon />
        </MarkToolbarButton>
        <MarkToolbarButton
          nodeType={KEYS.strikethrough}
          tooltip="Tachado (Ctrl+Shift+M)"
        >
          <StrikethroughIcon />
        </MarkToolbarButton>
        <MarkToolbarButton nodeType={KEYS.code} tooltip="Código (Ctrl+E)">
          <Code2Icon />
        </MarkToolbarButton>
        <LinkToolbarButton />
      </ToolbarGroup>

      <ToolbarGroup>
        <FontColorToolbarButton nodeType={KEYS.color} tooltip="Cor do texto">
          <BaselineIcon />
        </FontColorToolbarButton>
        <FontColorToolbarButton
          nodeType={KEYS.backgroundColor}
          tooltip="Cor de fundo"
        >
          <PaintBucketIcon />
        </FontColorToolbarButton>
        <MarkToolbarButton nodeType={KEYS.highlight} tooltip="Marca-texto">
          <HighlighterIcon />
        </MarkToolbarButton>
      </ToolbarGroup>
    </>
  );
}
