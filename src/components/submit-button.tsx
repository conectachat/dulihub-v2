"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/**
 * Botão que envia o formulário em que está, e se trava enquanto a Server
 * Action roda.
 *
 * Existia em dez cópias locais, em cinco formatos que só diferiam em ícone e
 * tamanho. Precisa morar num componente próprio porque `useFormStatus` só lê o
 * estado do `<form>` **ancestral** — chamado no mesmo componente que declara o
 * formulário, ele nunca vê `pending`.
 *
 * O texto de espera é explícito, não inferido: "Criando..." e "Salvando..."
 * dizem coisas diferentes a quem está esperando, e quem sabe qual é quem usa.
 */
export function SubmitButton({
  children,
  pendente,
  icone: Icone,
  size,
  className,
}: {
  children: React.ReactNode;
  /** O que aparece enquanto grava. */
  pendente: string;
  icone?: React.ComponentType<{ className?: string }>;
  size?: "sm" | "default";
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size={size} disabled={pending} className={className}>
      {Icone ? <Icone className="mr-1 h-4 w-4" aria-hidden /> : null}
      {pending ? pendente : children}
    </Button>
  );
}
