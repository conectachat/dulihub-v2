"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { falhou, gravou, type ActionState } from "@/lib/action-state";
import { NADA_GRAVADO, traduzirErro } from "@/lib/erros";
import { resultado, resultadoSemContagem } from "@/lib/gravar";
import { parseMoney } from "@/lib/numbers";
import { contextoAtual } from "@/lib/organizacao";

const opportunitySchema = z.object({
  person_id: z.string().uuid("Escolha um contato"),
  stage_id: z.string().uuid("Escolha uma etapa"),
  title: z.string().trim().min(1, "Informe um título"),
  value: z.string().nullish().transform(parseMoney),
  currency: z.enum(["BRL", "USD"]).default("BRL"),
  source: z.string().trim().optional(),
});

export async function createOpportunity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = opportunitySchema.safeParse({
    person_id: formData.get("person_id"),
    stage_id: formData.get("stage_id"),
    title: formData.get("title"),
    value: formData.get("value"),
    currency: formData.get("currency") ?? "BRL",
    source: formData.get("source"),
  });

  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  const { supabase, userId, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  // A organização do negócio vem **da pessoa**, não da associação de quem
  // clicou. São coisas diferentes no dia em que existir parceiro, e usar a
  // associação carimbaria um contato de uma organização com o id de outra —
  // sem erro nenhum, porque a RLS aprova a linha resultante.
  const { data: pessoa, error: erroDaPessoa } = await supabase
    .from("people")
    .select("organization_id")
    .eq("id", parsed.data.person_id)
    .maybeSingle();

  if (erroDaPessoa) return falhou(traduzirErro(erroDaPessoa));
  if (!pessoa) return falhou("Contato não encontrado.");

  const { data: stage, error: stageError } = await supabase
    .from("pipeline_stages")
    .select("pipeline_id, probability, is_won, is_lost")
    .eq("id", parsed.data.stage_id)
    .maybeSingle();

  if (stageError) return falhou(traduzirErro(stageError));
  if (!stage) return falhou("Etapa não encontrada.");

  const terminal = stage.is_won || stage.is_lost;

  const { error } = await supabase.from("opportunities").insert({
    organization_id: pessoa.organization_id,
    person_id: parsed.data.person_id,
    pipeline_id: stage.pipeline_id,
    stage_id: parsed.data.stage_id,
    title: parsed.data.title,
    value: parsed.data.value,
    currency: parsed.data.currency,
    source: parsed.data.source || null,
    probability: stage.probability,
    // O banco exige coerência entre status e data de encerramento.
    status: stage.is_won ? "won" : stage.is_lost ? "lost" : "open",
    closed_at: terminal ? new Date().toISOString() : null,
    owner_id: userId,
    created_by: userId,
  });

  if (error) return falhou(traduzirErro(error));

  // Quem tem oportunidade deixa de ser simples contato. Cliente não regride.
  //
  // O `.neq` faz parte do filtro, então zero linhas aqui quer dizer "já era
  // cliente" — resultado certo, não falha. Por isso a checagem é do erro, e
  // não da contagem: `resultado()` leria o zero como recusa.
  const promocao = resultadoSemContagem(
    await supabase
      .from("people")
      .update({ lifecycle_stage: stage.is_won ? "client" : "opportunity" })
      .eq("id", parsed.data.person_id)
      .neq("lifecycle_stage", "client"),
  );
  if (promocao.error) return promocao;

  revalidatePath("/crm");
  revalidatePath("/contatos");
  return gravou();
}

/**
 * Move a oportunidade para outra etapa.
 *
 * Etapa terminal define status e data de encerramento; voltar para o meio do
 * funil reabre. Assim a coluna onde o cartão está e o status nunca divergem.
 */
export async function moveOpportunity(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const stageId = formData.get("stage_id");
  if (typeof id !== "string" || typeof stageId !== "string") {
    return falhou("Movimento não informado.");
  }

  const { supabase, userId, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data: stage, error: stageError } = await supabase
    .from("pipeline_stages")
    .select("name, probability, is_won, is_lost")
    .eq("id", stageId)
    .maybeSingle();

  if (stageError) return falhou(traduzirErro(stageError));
  if (!stage) return falhou("Etapa não encontrada.");

  const terminal = stage.is_won || stage.is_lost;

  const { data: updated, error: updateError } = await supabase
    .from("opportunities")
    .update({
      stage_id: stageId,
      probability: stage.probability,
      status: stage.is_won ? "won" : stage.is_lost ? "lost" : "open",
      closed_at: terminal ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("person_id, organization_id")
    .maybeSingle();

  if (updateError) return falhou(traduzirErro(updateError));
  if (!updated) return falhou(NADA_GRAVADO);

  if (updated.person_id) {
    // Registra o movimento: o histórico da pessoa precisa mostrar por onde a
    // negociação passou, não só onde parou.
    //
    // Falhar aqui é falha da operação inteira, não detalhe: sem o registro, o
    // cartão muda de coluna e o histórico perde o movimento para sempre — que
    // é exatamente o que este bloco existe para preservar.
    const registro = resultadoSemContagem(
      await supabase.from("activities").insert({
        // Do próprio negócio, não da associação de quem clicou: o registro
        // pertence à organização dona da oportunidade.
        organization_id: updated.organization_id,
        person_id: updated.person_id,
        opportunity_id: id,
        type: "stage_change",
        description: `Movida para ${stage.name}`,
        created_by: userId,
      }),
    );
    if (registro.error) return registro;

    if (stage.is_won) {
      const promocao = resultado(
        await supabase
          .from("people")
          .update({ lifecycle_stage: "client" })
          .eq("id", updated.person_id)
          .select("id"),
      );
      if (promocao.error) return promocao;
    }
  }

  revalidatePath("/crm");
  revalidatePath("/contatos");
  return gravou();
}

export async function deleteOpportunity(
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Oportunidade não informada.");

  const { supabase } = await contextoAtual();
  const estado = resultado(
    await supabase.from("opportunities").delete().eq("id", id).select("id"),
  );
  if (estado.error) return estado;

  revalidatePath("/crm");
  revalidatePath("/contatos");
  return estado;
}
