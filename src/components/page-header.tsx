import { cn } from "@/lib/utils";

/**
 * Cabeçalho de página: título, descrição e ações.
 *
 * Existe para que toda tela abra do mesmo jeito. A semelhança de família entre
 * telas vem daqui, do espaçamento e da cor — não de forçar tabela e quadro no
 * mesmo formato.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn("flex flex-wrap items-start justify-between gap-4", className)}
    >
      <div className="min-w-0">
        <h1 className="font-serif text-2xl font-medium tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Mesma ideia, um nível abaixo — usado dentro das seções de configuração. */
export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="font-serif text-xl font-medium tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
