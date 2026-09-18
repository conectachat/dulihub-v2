'use client';

import * as React from 'react';

import type { TComboboxInputElement, TMentionElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';

import { getMentionOnSelectItem } from '@platejs/mention';
import { IS_APPLE, KEYS } from 'platejs';
import {
  PlateElement,
  useFocused,
  useReadOnly,
  useSelected,
} from 'platejs/react';

import { cn } from '@/lib/utils';
import { useMounted } from '@/hooks/use-mounted';
import { inlineSuggestionVariants } from '@/lib/suggestion';

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox';

export function MentionElement(
  props: PlateElementProps<TMentionElement> & {
    prefix?: string;
  }
) {
  const { element } = props;
  const selected = useSelected();
  const focused = useFocused();
  const mounted = useMounted();
  const readOnly = useReadOnly();

  return (
    <PlateElement
      {...props}
      className={cn(
        'inline-block rounded-md bg-muted px-1.5 py-0.5 align-baseline font-medium text-sm',
        inlineSuggestionVariants(),
        !readOnly && 'cursor-pointer',
        selected && focused && 'ring-2 ring-ring',
        element.children[0][KEYS.bold] === true && 'font-bold',
        element.children[0][KEYS.italic] === true && 'italic',
        element.children[0][KEYS.underline] === true && 'underline'
      )}
      attributes={{
        ...props.attributes,
        contentEditable: false,
        'data-slate-value': element.value,
        draggable: true,
      }}
    >
      {mounted && IS_APPLE ? (
        // Mac OS IME https://github.com/ianstormtaylor/slate/issues/3490
        <>
          {props.children}
          {props.prefix}
          {element.value}
        </>
      ) : (
        // Others like Android https://github.com/ianstormtaylor/slate/pull/5360
        <>
          {props.prefix}
          {element.value}
          {props.children}
        </>
      )}
    </PlateElement>
  );
}

const onSelectItem = getMentionOnSelectItem();

/**
 * Quem pode ser @mencionado: a equipe da organização do processo, dada por
 * quem monta o editor. O registro do Plate trazia uma lista de exemplo com
 * personagens de Star Wars no lugar.
 */
export const EquipeParaMencionar = React.createContext<
  { id: string; nome: string }[]
>([]);

export function MentionInputElement(
  props: PlateElementProps<TComboboxInputElement>
) {
  const { editor, element } = props;
  const [search, setSearch] = React.useState('');
  const equipe = React.useContext(EquipeParaMencionar);

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox
        value={search}
        element={element}
        setValue={setSearch}
        showTrigger={false}
        trigger="@"
      >
        <span className="inline-block rounded-md bg-muted px-1.5 py-0.5 align-baseline text-sm ring-ring focus-within:ring-2">
          <InlineComboboxInput />
        </span>

        <InlineComboboxContent className="my-1.5">
          <InlineComboboxEmpty>Nada encontrado</InlineComboboxEmpty>

          <InlineComboboxGroup>
            {equipe.map((pessoa) => (
              <InlineComboboxItem
                key={pessoa.id}
                value={pessoa.nome}
                onClick={() =>
                  onSelectItem(editor, { key: pessoa.id, text: pessoa.nome }, search)
                }
              >
                {pessoa.nome}
              </InlineComboboxItem>
            ))}
          </InlineComboboxGroup>
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}
