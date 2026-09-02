import Link from "next/link";
import { KanbanSquare, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { deleteOpportunity } from "@/features/opportunities/actions";
import { getBoard, listPeopleForPicker } from "@/features/opportunities/queries";

import { MoveCard } from "./move-card";
import { OpportunityDialog } from "./opportunity-dialog";

export const metadata = { title: "CRM — Duli Hub" };

function money(value: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function CrmPage() {
  const [board, people] = await Promise.all([getBoard(), listPeopleForPicker()]);

  if (board.error) {
    return (
      <main className="space-y-4 p-6">
        <PageHeader title="CRM" />
        <div className="rounded-2xl border border-destructive/50 p-4 text-sm">
          <p className="font-medium text-destructive">
            Não foi possível carregar o funil.
          </p>
          <p className="text-muted-foreground">{board.error}</p>
        </div>
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

  // Só o que está em negociação. Ganho e perdido já saíram do funil, e somá-los
  // aqui daria um número que não significa nada.
  const totalAberto = board.stages
    .filter((s) => !s.is_won && !s.is_lost)
    .reduce((sum, s) => sum + (board.totalsByStage[s.id]?.value ?? 0), 0);

  return (
    <main className="space-y-6 p-6">
      <PageHeader
        title="CRM"
        description={`${board.pipelineName} · ${money(totalAberto, "BRL")} em negociação`}
        actions={<OpportunityDialog people={people} stages={stageOptions} />}
      />

      <div className="flex gap-4 overflow-x-auto pb-4">
        {board.stages.map((stage) => {
          const cards = board.cardsByStage[stage.id] ?? [];
          const totals = board.totalsByStage[stage.id] ?? { count: 0, value: 0 };

          return (
            <section
              key={stage.id}
              className="flex w-72 shrink-0 flex-col rounded-3xl bg-muted/50 p-3"
              aria-label={`Etapa ${stage.name}`}
            >
              <div className="mb-3 px-1">
                <h2 className="flex items-center gap-2 truncate text-sm font-semibold">
                  {stage.is_won ? (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
                  ) : stage.is_lost ? (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" />
                  ) : null}
                  {stage.name}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {totals.count}
                  {totals.value > 0 ? ` · ${money(totals.value, "BRL")}` : ""}
                </p>
              </div>

              <div className="flex-1 space-y-2">
                {cards.length === 0 ? (
                  <EmptyState title="Vazia" size="compact" />
                ) : (
                  cards.map((card) => (
                    <article
                      key={card.id}
                      className="space-y-2 rounded-2xl border bg-card p-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 text-sm font-medium leading-snug">
                          {card.title}
                        </p>
                        <form action={deleteOpportunity}>
                          <input type="hidden" name="id" value={card.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                            aria-label={`Excluir ${card.title}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </form>
                      </div>

                      {card.person ? (
                        <Link
                          href={`/contatos/${card.person.id}`}
                          className="block truncate text-xs text-muted-foreground hover:underline"
                        >
                          {card.person.full_name}
                        </Link>
                      ) : null}

                      {card.value != null ? (
                        <p className="text-sm font-semibold tabular-nums">
                          {money(card.value, card.currency)}
                        </p>
                      ) : null}

                      <MoveCard
                        opportunityId={card.id}
                        currentStageId={card.stage_id}
                        stages={stageOptions}
                      />
                    </article>
                  ))
                )}
              </div>

              <div className="pt-2">
                <OpportunityDialog
                  people={people}
                  stages={stageOptions}
                  defaultStageId={stage.id}
                  label="Adicionar"
                  variant="ghost"
                />
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
