import { Timeline } from "@/components/perfil/timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TimelineItem } from "@/features/people/timeline-queries";

/**
 * A aba Notas do cliente (CLI-9): a nota nova em cima, o histórico logo
 * abaixo, e as observações do cadastro antigo por último — são o passado, e
 * não podem empurrar o que acontece hoje para fora da tela.
 *
 * Só a equipe lê notas e histórico (0046): o cliente do portal não.
 */
export function AbaNotas({
  personId,
  items,
  currentUserId,
  observacoesAntigas,
}: {
  personId: string;
  items: TimelineItem[];
  currentUserId: string | null;
  observacoesAntigas: string | null;
}) {
  return (
    <div className="space-y-6">
      <Timeline personId={personId} items={items} currentUserId={currentUserId} />

      {observacoesAntigas ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Observações do cadastro antigo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{observacoesAntigas}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
