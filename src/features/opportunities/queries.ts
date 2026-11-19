import type { Tables } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

import { POR_PAGINA } from "@/lib/paginacao";
import { somarItensPorMoeda, type PorMoeda } from "@/lib/totals";

import { filtroDoQuadro } from "./regras";

export type Stage = Pick<
  Tables<"pipeline_stages">,
  "id" | "name" | "position" | "probability" | "is_won" | "is_lost"
>;

export type BoardCard = Pick<
  Tables<"opportunities">,
  "id" | "title" | "status" | "stage_id" | "created_at"
> & {
  /** Os vistos do negócio: o cartão e a coluna somam por moeda (CRM-13). */
  itens: Pick<Tables<"opportunity_items">, "amount" | "currency">[];
  person:
    | (Pick<Tables<"people">, "id" | "full_name"> & {
        /** Os links da ficha de cadastro do contato; a tela escolhe o vigente. */
        fichas: Pick<
          Tables<"registration_forms">,
          "created_at" | "expires_at" | "cancelled_at" | "submitted_at" | "reviewed_at"
        >[];
      })
    | null;
  /** Processos nascidos deste negócio — é o que decide o atalho no Ganho. */
  processos: Pick<Tables<"projects">, "id">[];
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

  const [
    { data: stagesData, error: stagesError },
    { data: cardsData, error: cardsError },
  ] =
    await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("id, name, position, probability, is_won, is_lost")
        .eq("pipeline_id", pipeline.id)
        .order("position"),
      supabase
        .from("opportunities")
        .select(
          `id, title, status, stage_id, created_at,
           itens:opportunity_items(amount, currency),
           person:people(id, full_name,
             fichas:registration_forms(created_at, expires_at, cancelled_at, submitted_at, reviewed_at)),
           processos:projects!projects_opportunity_same_org(id)`,
        )
        .eq("pipeline_id", pipeline.id)
        // Abertos, e encerrados há até 30 dias; o resto, em Encerradas (CRM-16).
        .or(filtroDoQuadro(new Date()))
        .order("created_at", { ascending: false }),
    ]);

  const stages: Stage[] = stagesData ?? [];
  const cards: BoardCard[] = cardsData ?? [];

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
    totalsByStage[stage.id].porMoeda = somarItensPorMoeda(
      cardsByStage[stage.id].flatMap((card) => card.itens),
    );
  }

  return {
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    stages,
    cardsByStage,
    totalsByStage,
    // Antes só o erro dos cartões subia. Com as etapas falhando o quadro
    // aparecia sem coluna nenhuma e sem explicação, porque error vinha nulo.
    error: stagesError?.message ?? cardsError?.message ?? null,
  };
}

/**
 * Pessoas para o seletor ao criar oportunidade.
 *
 * Com canal de erro porque, sem ele, uma leitura falha deixava o seletor
 * "Contato" vazio: a pessoa não conseguia criar oportunidade nenhuma e nada
 * na tela dizia por quê.
 */
export async function listPeopleForPicker() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("id, full_name")
    .is("deleted_at", null)
    .order("full_name")
    .limit(500);

  return {
    people: data ?? [],
    error: error?.message ?? null,
  };
}

/**
 * Um negócio inteiro, para a tela do lead: o negócio, o contato dele e as
 * etapas do funil em que ele está. Negócio nulo quando a RLS esconde.
 *
 * As etapas vêm em leitura à parte: etapa e funil têm duas chaves entre si (a
 * simples e a composta da 0027), e o embutido não sabe qual seguir.
 */
export async function obterNegocio(id: string) {
  const supabase = await createClient();

  const { data: negocio, error } = await supabase
    .from("opportunities")
    .select(
      `id, organization_id, title, status, stage_id, pipeline_id, source,
       lost_reason, created_at, closed_at, owner_id,
       participantes:opportunity_participants(user_id),
       itens:opportunity_items(id, visa_type_id, visa_name, amount, currency, position),
       person:people(id, full_name, email, phone, phone_country_code, company,
         job_title, lifecycle_stage, person_tags(tag:tags(id, name)))`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return { negocio: null, etapas: [], catalogo: [], error: error.message };
  if (!negocio) return { negocio: null, etapas: [], catalogo: [], error: null };

  // O catálogo da organização do negócio — inclusive os inativos, para a
  // edição de um item antigo; o seletor de visto novo mostra só os ativos.
  const [{ data: etapas, error: erroEtapas }, { data: catalogo, error: erroCatalogo }] =
    await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("id, name, position, probability, is_won, is_lost")
        .eq("pipeline_id", negocio.pipeline_id)
        .order("position"),
      supabase
        .from("visa_types")
        .select("id, name, base_price, currency, is_active")
        .eq("organization_id", negocio.organization_id)
        .order("name"),
    ]);

  return {
    negocio: {
      ...negocio,
      itens: [...negocio.itens].sort((a, b) => a.position - b.position),
    },
    etapas: (etapas ?? []) as Stage[],
    catalogo: catalogo ?? [],
    error: erroEtapas?.message ?? erroCatalogo?.message ?? null,
  };
}

export type NegocioEncerrado = {
  id: string;
  title: string;
  status: "won" | "lost";
  closed_at: string | null;
  person_id: string;
  full_name: string;
  /** A soma dos vistos, por moeda. */
  totais: PorMoeda;
};

/** O `totais` de `buscar_encerradas` chega como `Json`: lido por esquema. */
const totaisSchema = z.array(z.object({ currency: z.string(), amount: z.number() }));

/**
 * Uma página de CRM › Encerradas (CRM-16), com o total do filtro.
 *
 * A busca é `buscar_encerradas` (0053), sob a RLS de quem chama: por título
 * ou pelo nome do contato, e ganha/perdida. Os tipos gerados perdem a
 * nulidade em função que devolve tabela; `closed_at` pode vir nulo.
 */
export async function listarEncerradas({
  busca,
  situacao = null,
  pagina,
}: {
  busca?: string;
  situacao?: "won" | "lost" | null;
  pagina: number;
}): Promise<{ negocios: NegocioEncerrado[]; total: number; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("buscar_encerradas", {
    p_busca: busca?.trim() ?? "",
    // Sem filtro, o parâmetro não vai: o padrão da função é "todas".
    ...(situacao ? { p_situacao: situacao } : {}),
    p_limite: POR_PAGINA,
    p_deslocamento: (pagina - 1) * POR_PAGINA,
  });
  if (error) return { negocios: [], total: 0, error: error.message };

  const linhas = data ?? [];
  const negocios: NegocioEncerrado[] = [];
  for (const l of linhas) {
    const totais = totaisSchema.safeParse(l.totais);
    if (!totais.success) {
      return { negocios: [], total: 0, error: "O servidor respondeu num formato inesperado." };
    }
    negocios.push({
      id: l.id,
      title: l.title,
      status: l.status === "won" ? "won" : "lost",
      closed_at: l.closed_at as string | null,
      person_id: l.person_id,
      full_name: l.full_name,
      totais: somarItensPorMoeda(totais.data),
    });
  }

  return { negocios, total: Number(linhas[0]?.total ?? 0), error: null };
}
