"use client";

import Link from "next/link";

import { moveOpportunity } from "@/features/opportunities/actions";
import type { DegrauDaTrilha } from "@/features/opportunities/regras";
import { comAviso } from "@/lib/avisar";
import { cn } from "@/lib/utils";

/**
 * A trilha do funil, no topo da tela do lead: as etapas do meio em ordem, a
 * atual marcada, e um clique para mover.
 *
 * Ganho e Perdido não aparecem aqui — são saídas, com botão e pergunta
 * próprios. `travada` é o negócio já ganho: o caminho fica à vista, mas não
 * anda mais.
 */
export function Trilha({
  negocioId,
  degraus,
  travada = false,
}: {
  negocioId: string;
  degraus: DegrauDaTrilha[];
  travada?: boolean;
}) {
  if (degraus.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Este funil não tem etapas entre a entrada e o fechamento.{" "}
        <Link href="/configuracoes/etapas-do-funil" className="underline">
          Criar em Etapas do funil
        </Link>
        .
      </p>
    );
  }

  return (
    <ol className="flex gap-2 overflow-x-auto" aria-label="Etapas do funil">
      {degraus.map((degrau) => {
        const conteudo = (
          <>
            <span
              className={cn(
                "block h-1.5 rounded-full",
                degrau.estado === "futura" ? "bg-muted" : "bg-primary",
              )}
            />
            <span
              className={cn(
                "mt-2 block truncate text-left text-xs",
                degrau.estado === "atual"
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {degrau.name}
            </span>
          </>
        );

        return (
          <li
            key={degrau.id}
            className="min-w-28 flex-1"
            aria-current={degrau.estado === "atual" ? "step" : undefined}
          >
            {travada || degrau.estado === "atual" ? (
              <div>{conteudo}</div>
            ) : (
              <form action={comAviso(moveOpportunity)}>
                <input type="hidden" name="id" value={negocioId} />
                <input type="hidden" name="stage_id" value={degrau.id} />
                <button
                  type="submit"
                  aria-label={`Mover para ${degrau.name}`}
                  className="block w-full rounded-lg outline-none hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {conteudo}
                </button>
              </form>
            )}
          </li>
        );
      })}
    </ol>
  );
}
