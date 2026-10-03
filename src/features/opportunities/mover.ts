import type { SupabaseClient } from "@supabase/supabase-js";

import { NADA_GRAVADO, traduzirErro } from "@/lib/erros";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Pôr um negócio numa etapa — o miolo de mover, ganhar e perder.
 *
 * Mora fora de `actions.ts` e recebe o cliente pronto de propósito: assim
 * roda contra o banco de verdade na suíte de RLS (`tests/rls/funil.test.ts`),
 * sem o Next em volta. As Server Actions só acrescentam sessão, validação do
 * formulário e revalidação por cima.
 */

type Cliente = SupabaseClient<Database>;

export type EtapaDeDestino = {
  id: string;
  name: string;
  probability: number | null;
  is_won: boolean;
  is_lost: boolean;
};

export const COLUNAS_DA_ETAPA = "id, name, probability, is_won, is_lost";

/**
 * Etapa terminal define status e data de encerramento; voltar para o meio do
 * funil reabre. Assim a coluna onde o cartão está e o status nunca divergem.
 *
 * O motivo da perda só existe enquanto o negócio está perdido: qualquer outra
 * etapa o apaga, senão um negócio reaberto e ganho carregaria para sempre o
 * motivo de uma perda que não aconteceu.
 *
 * Ganho faz do contato um cliente. O caminho de volta não existe: reabrir o
 * negócio não rebaixa ninguém.
 */
export async function aplicarEtapa(
  supabase: Cliente,
  userId: string | null,
  id: string,
  etapa: EtapaDeDestino,
  motivo: string | null,
): Promise<{ error: string | null; personId: string | null }> {
  const terminal = etapa.is_won || etapa.is_lost;

  const { data: updated, error: updateError } = await supabase
    .from("opportunities")
    .update({
      stage_id: etapa.id,
      probability: etapa.probability,
      status: etapa.is_won ? "won" : etapa.is_lost ? "lost" : "open",
      closed_at: terminal ? new Date().toISOString() : null,
      lost_reason: etapa.is_lost ? motivo : null,
    })
    .eq("id", id)
    .select("person_id, organization_id")
    .maybeSingle();

  if (updateError) return { error: traduzirErro(updateError), personId: null };
  // A policy filtra em vez de recusar: zero linhas é recusa.
  if (!updated) return { error: NADA_GRAVADO, personId: null };

  // Registra o movimento: o histórico da pessoa precisa mostrar por onde a
  // negociação passou, não só onde parou.
  //
  // Falhar aqui é falha da operação inteira, não detalhe: sem o registro, o
  // cartão muda de coluna e o histórico perde o movimento para sempre — que
  // é exatamente o que este bloco existe para preservar.
  const registro = await supabase.from("activities").insert({
    // Do próprio negócio, não da associação de quem clicou: o registro
    // pertence à organização dona da oportunidade.
    organization_id: updated.organization_id,
    person_id: updated.person_id,
    opportunity_id: id,
    type: "stage_change",
    description:
      etapa.is_lost && motivo
        ? `Movida para ${etapa.name} — motivo: ${motivo}`
        : `Movida para ${etapa.name}`,
    created_by: userId,
  });
  if (registro.error) {
    return { error: traduzirErro(registro.error), personId: updated.person_id };
  }

  if (etapa.is_won) {
    const promocao = await supabase
      .from("people")
      .update({ lifecycle_stage: "client" })
      .eq("id", updated.person_id)
      .select("id");
    if (promocao.error) {
      return { error: traduzirErro(promocao.error), personId: updated.person_id };
    }
    if (!promocao.data || promocao.data.length === 0) {
      return { error: NADA_GRAVADO, personId: updated.person_id };
    }
  }

  return { error: null, personId: updated.person_id };
}

/** A etapa de ganho ou de perda do funil em que o negócio está. */
export async function etapaTerminal(
  supabase: Cliente,
  id: string,
  qual: "is_won" | "is_lost",
): Promise<{ etapa: EtapaDeDestino | null; error: string | null }> {
  const { data: negocio, error: erroNegocio } = await supabase
    .from("opportunities")
    .select("pipeline_id")
    .eq("id", id)
    .maybeSingle();
  if (erroNegocio) return { etapa: null, error: traduzirErro(erroNegocio) };
  if (!negocio) return { etapa: null, error: "Negócio não encontrado." };

  const { data: etapa, error: erroEtapa } = await supabase
    .from("pipeline_stages")
    .select(COLUNAS_DA_ETAPA)
    .eq("pipeline_id", negocio.pipeline_id)
    .eq(qual, true)
    .maybeSingle();
  if (erroEtapa) return { etapa: null, error: traduzirErro(erroEtapa) };
  if (!etapa) {
    return {
      etapa: null,
      error: `O funil não tem etapa de ${qual === "is_won" ? "ganho" : "perda"}. Crie em Configurações › Etapas do funil.`,
    };
  }
  return { etapa, error: null };
}
