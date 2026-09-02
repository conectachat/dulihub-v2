import { cn } from "@/lib/utils";

/**
 * Estado vazio.
 *
 * Substitui dezoito blocos escritos à mão em onze arquivos, cada um com
 * padding e texto ligeiramente diferentes.
 *
 * `hint` existe porque tela vazia sem explicação é o pior momento de um
 * sistema: a pessoa não sabe se está quebrado, se falta permissão, ou se ela
 * é que precisa fazer algo.
 */
export function EmptyState({
  title,
  hint,
  icon: Icon,
  action,
  size = "default",
  className,
}: {
  title: string;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  /** `compact` para vazios dentro de coluna ou cartão pequeno. */
  size?: "default" | "compact";
  className?: string;
}) {
  const compact = size === "compact";

  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed text-center",
        compact ? "p-4" : "p-10",
        className,
      )}
    >
      {Icon && !compact ? (
        <Icon className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
      ) : null}

      <p className={cn("font-medium", compact ? "text-xs" : "text-sm")}>{title}</p>

      {hint ? (
        <p
          className={cn(
            "mx-auto mt-1 max-w-md text-muted-foreground",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {hint}
        </p>
      ) : null}

      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
