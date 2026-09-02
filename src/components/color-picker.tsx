"use client";

import { PALETTE } from "@/lib/palette";
import { cn } from "@/lib/utils";

/**
 * Escolha de cor a partir da paleta da marca.
 *
 * Botões de rádio escondidos sob os círculos: o formulário envia o valor
 * normalmente, e teclado e leitor de tela navegam entre as opções sem que a
 * tela precise reimplementar nada disso.
 */
export function ColorPicker({
  name,
  value,
  onChange,
  label = "Cor",
  colors = PALETTE,
}: {
  name: string;
  value: string;
  onChange?: (color: string) => void;
  label?: string;
  colors?: readonly string[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {colors.map((color) => (
        <label
          key={color}
          className={cn(
            "h-6 w-6 cursor-pointer rounded-full ring-offset-2 ring-offset-background transition-shadow",
            value === color && "ring-2 ring-foreground",
          )}
          style={{ backgroundColor: color }}
        >
          <input
            type="radio"
            name={name}
            value={color}
            checked={value === color}
            onChange={() => onChange?.(color)}
            className="sr-only"
          />
          <span className="sr-only">{color}</span>
        </label>
      ))}
    </div>
  );
}
