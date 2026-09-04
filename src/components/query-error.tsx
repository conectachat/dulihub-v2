import { AlertTriangle } from "lucide-react";

/**
 * Consulta que falhou.
 *
 * Existe porque a alternativa é o defeito mais caro desta base: treze telas
 * descartavam o erro da consulta e desenhavam **estado vazio**. Uma leitura
 * falha virava *"Nenhum tipo de visto ainda. Crie o primeiro"* — e a reação
 * natural a isso é recriar o que já existe, duplicando o catálogo. O cabeçalho
 * da migration `0011` já documentava a armadilha antes de ela acontecer.
 *
 * A regra que este componente serve para tornar estrutural: **`EmptyState` só
 * pode aparecer no ramo em que o erro é nulo.** Convenção não bastou — foi
 * exatamente ela que falhou nos treze lugares.
 *
 * `detalhe` é o texto técnico. Aparece porque quem opera este app é quem
 * também conserta, e "algo deu errado" sem mais nada não deixa ninguém agir.
 */
export function QueryError({
  title = "Não foi possível carregar",
  detalhe,
}: {
  title?: string;
  detalhe?: string | null;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
          aria-hidden
        />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-destructive">{title}</p>
          <p className="text-sm text-muted-foreground">
            Isto é falha de leitura, não lista vazia — o que estava aqui
            continua no banco. Recarregue a página; se insistir, mande o
            detalhe abaixo para quem cuida do sistema.
          </p>
          {detalhe ? (
            <p className="pt-1 font-mono text-xs break-words text-muted-foreground/80">
              {detalhe}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
