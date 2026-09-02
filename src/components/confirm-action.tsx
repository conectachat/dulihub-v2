"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Ação destrutiva com confirmação.
 *
 * `consequence` não é enfeite: é o texto que diz **o que exatamente se perde**
 * — quantos itens vão junto, quem deixa de ter acesso, o que não volta. Aviso
 * genérico do tipo "tem certeza?" faz a pessoa clicar sim no automático.
 *
 * Quando não há consequência (`needsConfirmation` falso), o botão envia direto:
 * pedir confirmação para apagar linha vazia só cansa.
 */
export function ConfirmAction({
  action,
  hidden,
  title,
  consequence,
  confirmLabel = "Excluir",
  triggerLabel,
  needsConfirmation = true,
  icon: Icon = Trash2,
  size = "icon",
}: {
  action: (formData: FormData) => void | Promise<void>;
  hidden: Record<string, string>;
  title: string;
  consequence?: string;
  confirmLabel?: string;
  /** Rótulo para leitor de tela. */
  triggerLabel: string;
  needsConfirmation?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  size?: "icon" | "sm";
}) {
  const [open, setOpen] = useState(false);

  const hiddenFields = Object.entries(hidden).map(([key, value]) => (
    <input key={key} type="hidden" name={key} value={value} />
  ));

  if (!needsConfirmation) {
    return (
      <form action={action}>
        {hiddenFields}
        <Button
          type="submit"
          variant="ghost"
          size={size}
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          aria-label={triggerLabel}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </form>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={size}
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        onClick={() => setOpen(true)}
        aria-label={triggerLabel}
      >
        <Icon className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {consequence ? (
              <DialogDescription>{consequence}</DialogDescription>
            ) : null}
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <form action={action}>
              {hiddenFields}
              <Button type="submit" variant="destructive">
                {confirmLabel}
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
