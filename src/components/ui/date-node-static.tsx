import * as React from 'react';

import { getDateDisplayLabel } from '@platejs/date';
import type { TDateElement } from 'platejs';
import type { SlateElementProps } from 'platejs/static';

import { SlateElement } from 'platejs/static';
import { cn } from '@/lib/utils';
import { inlineSuggestionVariants } from '@/lib/suggestion';

const RELATIVE_DATE_LABELS: Record<string, string> = {
  Today: 'Hoje',
  Tomorrow: 'Amanhã',
  Yesterday: 'Ontem',
};

/** Mesmo rótulo do Plate, com "Today"/"Yesterday"/"Tomorrow" em português. */
export function getDateDisplayLabelPtBR(element: TDateElement) {
  const label = getDateDisplayLabel(element);

  return label ? (RELATIVE_DATE_LABELS[label] ?? label) : label;
}

export function DateElementStatic(props: SlateElementProps<TDateElement>) {
  const { element } = props;

  return (
    <SlateElement as="span" className="inline-block" {...props}>
      <span
        className={cn(
          'w-fit rounded-sm bg-muted px-1 text-muted-foreground',
          inlineSuggestionVariants()
        )}
      >
        {element.date || element.rawDate ? (
          getDateDisplayLabelPtBR(element)
        ) : (
          <span>Escolha uma data</span>
        )}
      </span>
      {props.children}
    </SlateElement>
  );
}
