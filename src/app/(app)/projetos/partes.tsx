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

/** O que `progressoDasEtapas` devolve (`features/projects/campos.ts`). */
type Progresso = { concluidas: number; total: number; percentual: number | null };

function Trilho({ percentual, className }: { percentual: number; className?: string }) {
  return (
    <div
      className={cn("overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentual}
      aria-label="Etapas concluídas"
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${percentual}%` }} />
    </div>
  );
}

/**
 * Barra de evolução do processo: etapas concluídas sobre todas as etapas.
 *
 * Versão de linha — lista de projetos e ficha do contato. O percentual é o que
 * se lê de relance; a contagem ao lado diz de quê.
 *
 * Sem etapa não há barra: o texto diz que falta o molde, em vez de um 0% que
 * faria o processo parecer parado.
 */
export function BarraDeProgresso({
  progresso,
  className,
}: {
  progresso: Progresso;
  className?: string;
}) {
  if (progresso.percentual === null) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>Sem etapas</span>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Trilho percentual={progresso.percentual} className="h-1.5 w-24" />
      <span className="w-9 text-right text-xs font-medium tabular-nums">
        {progresso.percentual}%
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {progresso.concluidas}/{progresso.total}
      </span>
    </div>
  );
}

/** A mesma conta, no cabeçalho do processo — com o nome do que está medindo. */
export function ProgressoDoProjeto({
  progresso,
  className,
}: {
  progresso: Progresso;
  className?: string;
}) {
  const { concluidas, total, percentual } = progresso;

  return (
    <div className={cn("w-full max-w-sm space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Progresso do projeto
        </span>
        {percentual === null ? null : (
          <span className="text-sm font-semibold tabular-nums">{percentual}%</span>
        )}
      </div>
      {percentual === null ? (
        <p className="text-xs text-muted-foreground">Sem etapas</p>
      ) : (
        <>
          <Trilho percentual={percentual} className="h-2.5 w-full" />
          <p className="text-xs text-muted-foreground">
            {concluidas} de {total} {total === 1 ? "etapa concluída" : "etapas concluídas"}
          </p>
        </>
      )}
    </div>
  );
}
