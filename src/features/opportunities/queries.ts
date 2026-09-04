import { createClient } from "@/lib/supabase/server";
import { somarPorMoeda, type PorMoeda } from "@/lib/totals";

export type Stage = {
  id: string;
  name: string;
  position: number;
  probability: number | null;
  is_won: boolean;
  is_lost: boolean;
};

export type BoardCard = {
  id: string;
  title: string;
  value: number | null;
  currency: string;
  status: "open" | "won" | "lost";
  stage_id: string;
  created_at: string;
  person: { id: string; full_name: string } | null;
};

export type Board = {
  pipelineId: string | null;
  pipelineName: string | null;
  stages: Stage[];
  cardsByStage: Record<string, BoardCard[]>;
  totalsByStage: Record<string, { count: number; porMoeda: PorMoeda }>;
  error: string | null;
};

/**
 * Quadro do funil: etapas em ordem, com as oportunidades de cada uma.
 *
 * Usa o funil marcado como padrão da organização. Quando houver mais de um,
 * esta função ganha um parâmetro — hoje seria complexidade sem uso.
 */
export async function getBoard(): Promise<Board> {
  const supabase = await createClient();

  const { data: pipeline, error: pipelineError } = await supabase
    .from("pipelines")
    .select("id, name")
    .eq("is_default", true)
    .maybeSingle();

  if (pipelineError) {
    return {
      pipelineId: null,
      pipelineName: null,
      stages: [],
      cardsByStage: {},
      totalsByStage: {},
      error: pipelineError.message,
    };
  }

  if (!pipeline) {
    return {
      pipelineId: null,
      pipelineName: null,
      stages: [],
      cardsByStage: {},
      totalsByStage: {},
      error: null,
    };
  }

  const [{ data: stagesData }, { data: cardsData, error: cardsError }] =
    await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("id, name, position, probability, is_won, is_lost")
        .eq("pipeline_id", pipeline.id)
        .order("position"),
      supabase
        .from("opportunities")
        .select(
          "id, title, value, currency, status, stage_id, created_at, person:people(id, full_name)",
        )
        .eq("pipeline_id", pipeline.id)
        .order("created_at", { ascending: false }),
    ]);

  const stages = (stagesData ?? []) as Stage[];
  const cards = (cardsData ?? []) as unknown as BoardCard[];

  const cardsByStage: Record<string, BoardCard[]> = {};
  const totalsByStage: Record<string, { count: number; porMoeda: PorMoeda }> = {};

  for (const stage of stages) {
    cardsByStage[stage.id] = [];
    totalsByStage[stage.id] = { count: 0, porMoeda: {} };
  }

  for (const card of cards) {
    if (!cardsByStage[card.stage_id]) continue;
    cardsByStage[card.stage_id].push(card);
    totalsByStage[card.stage_id].count += 1;
  }

  // Por moeda, e nunca somando uma na outra.
  for (const stage of stages) {
    totalsByStage[stage.id].porMoeda = somarPorMoeda(cardsByStage[stage.id]);
  }

  return {
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    stages,
    cardsByStage,
    totalsByStage,
    error: cardsError?.message ?? null,
  };
}

/** Pessoas para o seletor ao criar oportunidade. */
export async function listPeopleForPicker() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("people")
    .select("id, full_name")
    .is("deleted_at", null)
    .order("full_name")
    .limit(500);
  return (data ?? []) as { id: string; full_name: string }[];
}
