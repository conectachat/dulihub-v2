"use client";

import { useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PALETTE } from "@/lib/palette";
import { cn } from "@/lib/utils";

/**
 * Cor recolhida num círculo, para linha de lista.
 *
 * A paleta aberta ocupa 264px de largura fixa — sozinha, ~40% de tudo que uma
 * linha de configuração carrega. Era o que empurrava subir, descer e excluir
 * para uma segunda linha desalinhada. Recolhida, a linha cabe inteira e a cor
 * fica onde a pessoa já olha para saber qual é.
 *
 * `ColorPicker` continua certo nos formulários de criação, onde nada disputa
 * espaço e ver as nove de uma vez ajuda a escolher.
 *
 * **O balão não contém campo de formulário, e isso é de propósito.** O Radix
 * leva o conteúdo para fora da árvore, direto no `body`: botão de rádio ali
 * dentro sairia do `<form>` e pararia de ser enviado. Então quem carrega a cor
 * é um campo escondido no próprio formulário, e as opções daqui só mexem no
 * estado.
 */
export function ColorPickerPopover({
  value,
  onChange,
  label,
  colors = PALETTE,
}: {
  value: string;
  onChange: (color: string) => void;
  /** Rótulo para leitor de tela, ex.: "Cor de Em andamento". */
  label: string;
  colors?: readonly string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`${label} — atual ${value}`}
        className="h-5 w-5 shrink-0 rounded-full ring-offset-2 ring-offset-background transition-shadow hover:ring-2 hover:ring-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        style={{ backgroundColor: value }}
      />

      <PopoverContent className="w-auto">
        <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={value === color}
              aria-label={color}
              onClick={() => {
                onChange(color);
                setOpen(false);
              }}
              className={cn(
                "h-6 w-6 rounded-full ring-offset-2 ring-offset-popover transition-shadow",
                value === color && "ring-2 ring-foreground",
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
