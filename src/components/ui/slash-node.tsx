'use client';

/**
 * Menu do "/" — veio do registro do Plate e foi traduzido e enxugado para as
 * Observações do processo (18/set): sem IA, sem equação, desenho por código,
 * Excalidraw e nota de rodapé. As palavras-chave em inglês ficam: quem vem do
 * Notion digita "/table" e precisa achar a tabela.
 */

import * as React from 'react';

import type { PlateEditor, PlateElementProps } from 'platejs/react';

import {
  CalendarIcon,
  ChevronRightIcon,
  Code2,
  Columns2Icon,
  Columns3Icon,
  FileIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  LightbulbIcon,
  ListIcon,
  ListOrdered,
  MinusIcon,
  PilcrowIcon,
  Quote,
  Square,
  Table,
  TableOfContentsIcon,
} from 'lucide-react';
import { type TComboboxInputElement, KEYS } from 'platejs';
import { PlateElement } from 'platejs/react';

import {
  insertBlock,
  insertInlineElement,
} from '@/components/editor/transforms';

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox';

type Item = {
  icon: React.ReactNode;
  value: string;
  label: string;
  keywords?: string[];
  focusEditor?: boolean;
};

type Group = {
  group: string;
  items: (Item & { onSelect: (editor: PlateEditor, value: string) => void })[];
};

const bloco = (items: Item[]) =>
  items.map((item) => ({
    ...item,
    onSelect: (editor: PlateEditor, value: string) => {
      insertBlock(editor, value, { upsert: true });
    },
  }));

const groups: Group[] = [
  {
    group: 'Blocos básicos',
    items: bloco([
      { icon: <PilcrowIcon />, keywords: ['paragrafo', 'paragraph', 'text'], label: 'Texto', value: KEYS.p },
      { icon: <Heading1Icon />, keywords: ['titulo', 'title', 'h1', 'heading'], label: 'Título 1', value: KEYS.h1 },
      { icon: <Heading2Icon />, keywords: ['subtitulo', 'subtitle', 'h2', 'heading'], label: 'Título 2', value: KEYS.h2 },
      { icon: <Heading3Icon />, keywords: ['subtitulo', 'h3', 'heading'], label: 'Título 3', value: KEYS.h3 },
      { icon: <ListIcon />, keywords: ['marcadores', 'bullet', 'unordered', 'ul', '-'], label: 'Lista com marcadores', value: KEYS.ul },
      { icon: <ListOrdered />, keywords: ['numerada', 'numbered', 'ordered', 'ol', '1'], label: 'Lista numerada', value: KEYS.ol },
      { icon: <Square />, keywords: ['tarefa', 'checklist', 'todo', 'task', 'checkbox', '[]'], label: 'Lista de tarefas', value: KEYS.listTodo },
      { icon: <ChevronRightIcon />, keywords: ['recolhivel', 'toggle', 'collapsible', 'expandir'], label: 'Toggle (recolhível)', value: KEYS.toggle },
      { icon: <Table />, keywords: ['tabela', 'table', 'grade'], label: 'Tabela', value: KEYS.table },
      { icon: <LightbulbIcon />, keywords: ['destaque', 'callout', 'aviso', 'alerta', 'nota'], label: 'Destaque', value: KEYS.callout },
      { icon: <Quote />, keywords: ['citacao', 'quote', 'blockquote', '>'], label: 'Citação', value: KEYS.blockquote },
      { icon: <MinusIcon />, keywords: ['divisor', 'separador', 'divider', 'hr', '---'], label: 'Divisor', value: KEYS.hr },
      { icon: <Code2 />, keywords: ['codigo', 'code', '```'], label: 'Código', value: KEYS.codeBlock },
    ]),
  },
  {
    group: 'Mídia',
    items: bloco([
      { icon: <ImageIcon />, keywords: ['imagem', 'image', 'foto', 'print'], label: 'Imagem', value: KEYS.img },
      { icon: <FileIcon />, keywords: ['arquivo', 'file', 'pdf', 'anexo'], label: 'Arquivo', value: KEYS.file },
    ]),
  },
  {
    group: 'Organização',
    items: bloco([
      { icon: <Columns2Icon />, keywords: ['colunas', 'columns', 'lado a lado'], label: '2 colunas', value: 'action_two_columns' },
      { icon: <Columns3Icon />, keywords: ['colunas', 'columns'], label: '3 colunas', value: 'action_three_columns' },
      { icon: <TableOfContentsIcon />, keywords: ['sumario', 'indice', 'toc'], label: 'Sumário', value: KEYS.toc },
    ]),
  },
  {
    group: 'No meio do texto',
    items: [
      { focusEditor: true, icon: <CalendarIcon />, keywords: ['data', 'date', 'dia'], label: 'Data', value: KEYS.date },
    ].map((item) => ({
      ...item,
      onSelect: (editor: PlateEditor, value: string) => {
        insertInlineElement(editor, value);
      },
    })),
  },
];

export function SlashInputElement(
  props: PlateElementProps<TComboboxInputElement>
) {
  const { editor, element } = props;

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />

        <InlineComboboxContent>
          <InlineComboboxEmpty>Nada encontrado</InlineComboboxEmpty>

          {groups.map(({ group, items }) => (
            <InlineComboboxGroup key={group}>
              <InlineComboboxGroupLabel>{group}</InlineComboboxGroupLabel>

              {items.map(
                ({ focusEditor, icon, keywords, label, value, onSelect }) => (
                  <InlineComboboxItem
                    key={value}
                    value={value}
                    onClick={() => onSelect(editor, value)}
                    label={label}
                    focusEditor={focusEditor}
                    group={group}
                    keywords={keywords}
                  >
                    <div className="mr-2 text-muted-foreground">{icon}</div>
                    {label}
                  </InlineComboboxItem>
                )
              )}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}
