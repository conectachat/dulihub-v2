import { KanbanSquare } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { QueryError } from "@/components/query-error";
import { formatarPorMoeda, juntarMoedas } from "@/lib/totals";
import { linkVigente, situacaoDaFicha } from "@/features/cadastro/regras";
import { getBoard, listPeopleForPicker } from "@/features/opportunities/queries";

import { OpportunityDialog } from "./opportunity-dialog";
import { Quadro, type CartaoDoQuadro } from "./quadro";

export const metadata = { title: "CRM — Duli Hub" };

export default async function CrmPage() {
  const [board, { people, error: peopleError }] = await Promise.all([
    getBoard(),
    listPeopleForPicker(),
  ]);

  if (board.error ?? peopleError) {
    return (
      <main className="space-y-4 p-6">
        <PageHeader title="CRM" />
        <QueryError
          title="Não foi possível carregar o funil"
          detalhe={board.error ?? peopleError}
        />
      </main>
    );
  }

  if (!board.pipelineId) {
    return (
      <main className="space-y-4 p-6">
        <PageHeader title="CRM" />
        <EmptyState
          icon={KanbanSquare}
          title="Nenhum funil configurado."
          hint="Crie um funil em Configuração para começar."
        />
      </main>
    );
  }

  const stageOptions = board.stages.map((s) => ({ id: s.id, name: s.name }));
  // Um instante só para o quadro inteiro: link que vence durante a pintura
  // não aparece aberto num cartão e expirado no outro.
  const agora = new Date();

  // O quadro é desenhado no navegador, por causa do arrastar. Vai para lá só
  // o que o cartão mostra — e a situação da ficha já resolvida, para o
  // servidor e o navegador não discordarem sobre que horas são.
  const cartoes: CartaoDoQuadro[] = board.stages.flatMap((etapa) =>
    (board.cardsByStage[etapa.id] ?? []).map((card) => ({
      id: card.id,
      title: card.title,
      value: card.value,
      currency: card.currency,
      stage_id: card.stage_id,
      person: card.person
        ? { id: card.person.id, full_name: card.person.full_name }
        : null,
      processoId: card.processos[0]?.id ?? null,
      ficha: situacaoDaFicha(linkVigente(card.person?.fichas ?? []), agora),
    })),
  );

  // Só o que está em negociação. Ganho e perdido já saíram do funil, e somá-los
  // aqui daria um número que não significa nada.
  //
  // Por moeda, e não somado: dólar com real dá um número que não existe.
  const totalAberto = juntarMoedas(
    board.stages
      .filter((s) => !s.is_won && !s.is_lost)
      .map((s) => board.totalsByStage[s.id]?.porMoeda ?? {}),
  );

  return (
    <main className="space-y-6 p-6">
      <PageHeader
        title="CRM"
        description={`${board.pipelineName}${
          formatarPorMoeda(totalAberto)
            ? ` · ${formatarPorMoeda(totalAberto)} em negociação`
            : ""
        }`}
        actions={<OpportunityDialog people={people} stages={stageOptions} />}
      />

      <Quadro etapas={board.stages} cartoes={cartoes} pessoas={people} />
    </main>
  );
}
