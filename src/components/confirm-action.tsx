"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AcaoDeFormulario } from "@/lib/action-state";
import { comAviso } from "@/lib/avisar";
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
  disabled = false,
  disabledReason,
  icon: Icon = Trash2,
  size = "icon",
}: {
  action: AcaoDeFormulario;
  hidden: Record<string, string>;
  title: string;
  consequence?: string;
  confirmLabel?: string;
  /** Rótulo para leitor de tela. */
  triggerLabel: string;
  needsConfirmation?: boolean;
  /** Impede a ação sem escondê-la — a pessoa vê que existe e por que não pode. */
  disabled?: boolean;
  /** Explica o bloqueio ao passar o mouse. Obrigatório quando `disabled`. */
  disabledReason?: string;
  icon?: React.ComponentType<{ className?: string }>;
  size?: "icon" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const hiddenFields = Object.entries(hidden).map(([key, value]) => (
    <input key={key} type="hidden" name={key} value={value} />
  ));

  /**
   * O diálogo fica aberto depois de enviar — ninguém o fecha, e no sucesso ele
   * some junto com a linha que o continha. Isso deixa um lugar pronto para a
   * recusa, melhor que aviso flutuante: o flutuante some e deixa o diálogo
   * aberto sem explicação nenhuma.
   */
  async function confirmar(formData: FormData) {
    setErro(null);
    const resultado = await action(formData);
    if (resultado && resultado.error) setErro(resultado.error);
  }

  if (!needsConfirmation) {
    // Sem diálogo não há onde escrever: vai como aviso flutuante.
    return (
      <form action={comAviso(action)}>
        {hiddenFields}
        <Button
          type="submit"
          variant="ghost"
          size={size}
          className="h-8 w-8 text-primary/60 hover:text-destructive"
          aria-label={triggerLabel}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
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
        className="h-8 w-8 text-primary/60 hover:text-destructive"
        onClick={() => setOpen(true)}
        aria-label={triggerLabel}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
      >
        <Icon className="h-4 w-4" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(proximo) => {
          setOpen(proximo);
          if (!proximo) setErro(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {consequence ? (
              <DialogDescription>{consequence}</DialogDescription>
            ) : null}
          </DialogHeader>
          {erro ? (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <form action={confirmar}>
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
