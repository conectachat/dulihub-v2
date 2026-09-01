import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Página de seção ainda não construída.
 *
 * Existe para que o menu não tenha link quebrado, e para deixar explícito o
 * que cada seção vai fazer — em vez de uma tela vazia que não diz nada.
 */
export function ComingSoon({
  title,
  description,
  phase,
  items,
}: {
  title: string;
  description: string;
  phase: string;
  items: string[];
}) {
  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>

      <Card className="max-w-2xl rounded-3xl">
        <CardHeader>
          <CardTitle className="text-base">Em construção — {phase}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            O que esta seção vai ter:
          </p>
          <ul className="space-y-2 text-sm">
            {items.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
