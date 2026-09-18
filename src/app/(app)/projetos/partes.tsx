import { Badge } from "@/components/ui/badge";
import { STATUS_DO_PROCESSO, type StatusDoProcesso } from "@/features/projects/schema";
import { cn } from "@/lib/utils";

/**
 * Peças da tela de processo usadas em mais de um lugar: lista, ficha do
 * contato e o próprio processo. Sem estado — servem ao servidor e ao cliente.
 */

export function SeloDoStatus({ status }: { status: string }) {
  const nome = STATUS_DO_PROCESSO[status as StatusDoProcesso] ?? status;
  const variante =
    status === "approved"
      ? "default"
      : status === "denied"
        ? "destructive"
        : "secondary";
  return <Badge variant={variante}>{nome}</Badge>;
}

/**
 * Barra de pastas obrigatórias resolvidas.
 *
 * Sem pasta obrigatória não há barra: o texto diz que falta configurar, em vez
 * de uma barra cheia que faria o processo parecer pronto.
 */
export function BarraDeProgresso({
  progresso,
  className,
}: {
  progresso: { resolvidas: number; total: number; percentual: number | null };
  className?: string;
}) {
  if (progresso.percentual === null) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        Sem pasta obrigatória
      </span>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progresso.percentual}
        aria-label="Pastas obrigatórias resolvidas"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${progresso.percentual}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {progresso.resolvidas}/{progresso.total}
      </span>
    </div>
  );
}
