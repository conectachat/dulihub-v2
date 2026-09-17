import { cn } from "@/lib/utils";

/**
 * A recusa de uma gravação, escrita junto de onde ela aconteceu.
 *
 * Existia em dez cópias idênticas e mais duas variações dentro de
 * `ConfirmAction` e `InlineText`. `pequeno` é a única variação que tinha motivo:
 * embaixo de um campo de linha de lista, o texto normal empurra a linha.
 *
 * Sem mensagem não renderiza nada — nem o `<p>` vazio, que leitor de tela
 * anunciaria como alerta sem conteúdo.
 */
export function FieldError({
  mensagem,
  pequeno = false,
  className,
}: {
  mensagem: string | null | undefined;
  pequeno?: boolean;
  className?: string;
}) {
  if (!mensagem) return null;

  return (
    <p
      role="alert"
      className={cn(
        "text-destructive",
        pequeno ? "text-xs" : "text-sm",
        className,
      )}
    >
      {mensagem}
    </p>
  );
}
