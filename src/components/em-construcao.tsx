import { Badge } from "@/components/ui/badge";

/**
 * O que uma seção ainda não construída vai ter.
 *
 * Havia duas implementações da mesma lista: uma nas páginas de Projetos e
 * Financeiro, dentro de um cartão, e outra nas seções de Configurações, com
 * borda tracejada. Fica a tracejada — no `AGENTS.md`, tracejado quer dizer
 * exatamente "espaço que ainda vai ser preenchido".
 *
 * A lista existe para que o menu não leve a uma tela vazia que não diz nada.
 */
export function EmConstrucao({
  fase,
  itens,
}: {
  fase?: string;
  itens?: string[];
}) {
  return (
    <div className="max-w-2xl space-y-4 rounded-3xl border border-dashed p-5">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">Em construção</Badge>
        {fase ? <span className="text-sm text-muted-foreground">{fase}</span> : null}
      </div>

      {itens?.length ? (
        <ul className="space-y-2 text-sm">
          {itens.map((item) => (
            <li key={item} className="flex gap-2">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                aria-hidden
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
