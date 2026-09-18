'use client';

import * as React from 'react';

import { formatDateValue, parseCanonicalDateValue } from '@platejs/date';
import type { TDateElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';

import { PlateElement, useReadOnly } from 'platejs/react';

import { ptBR } from 'react-day-picker/locale';

import { Calendar } from '@/components/ui/calendar';
import { getDateDisplayLabelPtBR } from '@/components/ui/date-node-static';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { inlineSuggestionVariants } from '@/lib/suggestion';

export function DateElement(props: PlateElementProps<TDateElement>) {
  const { editor, element } = props;
  const readOnly = useReadOnly();

  const trigger = (
    <span
      className={cn(
        'w-fit cursor-pointer rounded-sm bg-muted px-1 text-muted-foreground',
        inlineSuggestionVariants()
      )}
      contentEditable={false}
      draggable
    >
      {element.date || element.rawDate ? (
        getDateDisplayLabelPtBR(element)
      ) : (
        <span>Escolha uma data</span>
      )}
    </span>
  );

  return (
    <PlateElement
      {...props}
      className="inline-block"
      attributes={{
        ...props.attributes,
        contentEditable: false,
      }}
    >
      {readOnly ? (
        trigger
      ) : (
        <Popover>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              selected={parseCanonicalDateValue(element.date ?? '')}
              onSelect={(date) => {
                if (!date) return;

                editor.tf.setNodes(
                  { date: formatDateValue(date), rawDate: undefined },
                  { at: element }
                );
              }}
              mode="single"
              locale={ptBR}
              autoFocus
            />
          </PopoverContent>
        </Popover>
      )}
      {props.children}
    </PlateElement>
  );
}
