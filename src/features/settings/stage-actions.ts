"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { falhou, gravou, type ActionState } from "@/lib/action-state";
import { traduzirErro } from "@/lib/erros";
import { resultado, resultadoSemContagem } from "@/lib/gravar";
import { createClient } from "@/lib/supabase/server";

/** @deprecated Use `ActionState` de `@/lib/action-state`. */
export type StageActionState = ActionState;

const nameSchema = z.string().trim().min(1, "Informe o nome da etapa").max(60);

/** Toda tela que muda quando o funil muda. */
function revalidar() {
  revalidatePath("/configuracoes/etapas-do-funil");
  revalidatePath("/crm");
}

/**
 * Cria uma etapa antes das terminais.
 *
 * Ganho e perdido vivem nas posições 98 e 99 justamente para que qualquer
 * etapa nova caiba antes delas sem precisar reordenar o funil inteiro.
 */
export async function createStage(
  _prev: StageActionState,
  formData: FormData,
): Promise<StageActionState> {
  const parsedName = nameSchema.safeParse(formData.get("name"));
  if (!parsedName.success) return falhou(parsedName.error.issues[0].message);

  const pipelineId = formData.get("pipeline_id");
  if (typeof pipelineId !== "string") return falhou("Funil não informado.");

  const supabase = await createClient();

  const { data: siblings, error: siblingsError } = await supabase
    .from("pipeline_stages")
    .select("position")
    .eq("pipeline_id", pipelineId)
    .eq("is_won", false)
    .eq("is_lost", false)
    .order("position", { ascending: false })
    .limit(1);

  if (siblingsError) return falhou(traduzirErro(siblingsError));

  const nextPosition = (siblings?.[0]?.position ?? -1) + 1;
  if (nextPosition >= 98) {
    return falhou("Limite de etapas atingido. Junte ou remova alguma antes.");
  }

  const resposta = await supabase
    .from("pipeline_stages")
    .insert({
      pipeline_id: pipelineId,
      name: parsedName.data,
      position: nextPosition,
    })
    .select("id");

  const estado = resultado(resposta);
  if (estado.error) return estado;

  revalidar();
  return gravou();
}

export async function renameStage(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const parsedName = nameSchema.safeParse(formData.get("name"));
  if (typeof id !== "string") return falhou("Etapa não informada.");
  if (!parsedName.success) return falhou(parsedName.error.issues[0].message);

  const supabase = await createClient();
  const estado = resultado(
    await supabase
      .from("pipeline_stages")
      .update({ name: parsedName.data })
      .eq("id", id)
      .select("id"),
  );

  if (estado.error) return estado;

  revalidar();
  return estado;
}

/**
 * Troca a etapa de lugar com a vizinha.
 *
 * Só entre etapas do meio: ganho e perdido ficam sempre no fim, porque o funil
 * termina neles.
 *
 * A troca em si vai por RPC (`0014`). Feita daqui, seriam três gravações sem
 * transação — falhar no meio deixaria a etapa presa na posição `-1`, no topo da
 * lista, com o botão de subir desabilitado por ser a primeira. Sem volta pela
 * tela.
 */
export async function moveStage(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const direction = formData.get("direction");
  if (typeof id !== "string" || (direction !== "up" && direction !== "down")) {
    return falhou("Movimento não informado.");
  }

  const supabase = await createClient();

  const { data: stage, error: stageError } = await supabase
    .from("pipeline_stages")
    .select("id, pipeline_id, position, is_won, is_lost")
    .eq("id", id)
    .maybeSingle();

  if (stageError) return falhou(traduzirErro(stageError));
  if (!stage) return falhou("Etapa não encontrada.");
  if (stage.is_won || stage.is_lost) {
    return falhou("Ganho e perdido ficam sempre no fim do funil.");
  }

  const { data: neighbour, error: neighbourError } = await supabase
    .from("pipeline_stages")
    .select("id, position")
    .eq("pipeline_id", stage.pipeline_id)
    .eq("is_won", false)
    .eq("is_lost", false)
    .order("position", { ascending: direction === "down" })
    [direction === "down" ? "gt" : "lt"]("position", stage.position)
    .limit(1)
    .maybeSingle();

  if (neighbourError) return falhou(traduzirErro(neighbourError));
  // Já está na ponta. Não é erro, e a tela já desabilita o botão.
  if (!neighbour) return gravou();

  const estado = resultadoSemContagem(
    await supabase.rpc("swap_positions", {
      p_tabela: "pipeline_stages",
      p_a: stage.id,
      p_b: neighbour.id,
    }),
  );

  if (estado.error) return estado;

  revalidar();
  return estado;
}

/**
 * Remove uma etapa do meio.
 *
 * Terminal não passa daqui: o gatilho `pipeline_stages_protect_terminal` no
 * banco recusa, e agora a mensagem dele chega ao usuário — antes era descartada
 * junto com o resto.
 */
export async function deleteStage(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Etapa não informada.");

  const supabase = await createClient();

  // Etapa com oportunidade dentro não some sem levar o negócio junto.
  //
  // O `?? 0` que estava aqui era caminho de perda de dado: contagem com erro
  // devolve `count` nulo, `?? 0` virava zero, a guarda abria e a exclusão
  // seguia. Erro de leitura não pode virar permissão.
  const { count, error: countError } = await supabase
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", id);

  if (countError) return falhou(traduzirErro(countError));
  if (count === null) {
    return falhou("Não foi possível conferir se há negócios nesta etapa.");
  }
  if (count > 0) {
    return falhou(
      count === 1
        ? "Há 1 negócio nesta etapa. Mova-o antes de excluí-la."
        : `Há ${count} negócios nesta etapa. Mova-os antes de excluí-la.`,
    );
  }

  const estado = resultado(
    await supabase.from("pipeline_stages").delete().eq("id", id).select("id"),
  );

  if (estado.error) return estado;

  revalidar();
  return estado;
}
