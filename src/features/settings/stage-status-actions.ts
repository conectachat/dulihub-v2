"use server";

import { revalidatePath } from "next/cache";

import { falhou, gravou, type ActionState } from "@/lib/action-state";
import { traduzirErro } from "@/lib/erros";
import { resultado, resultadoSemContagem } from "@/lib/gravar";
import { contextoAtual, SEM_ORGANIZACAO } from "@/lib/organizacao";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import {
  stageStatusColorSchema,
  stageStatusLabelSchema,
  toCode,
} from "./schema";

const SECTION = "/configuracoes/status-de-etapas";


export async function createStageStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const label = stageStatusLabelSchema.safeParse(formData.get("label"));
  if (!label.success) return falhou(label.error.issues[0].message);

  const color = stageStatusColorSchema.safeParse(formData.get("color"));
  if (!color.success) return falhou(color.error.issues[0].message);

  const { supabase, organizationId: orgId, error: erroDoContexto } =
    await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);
  if (!orgId) return falhou(SEM_ORGANIZACAO);

  const { data: last } = await supabase
    .from("stage_statuses")
    .select("position")
    .eq("organization_id", orgId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("stage_statuses").insert({
    organization_id: orgId,
    code: toCode(label.data),
    label: label.data,
    color: color.data,
    position: (last?.position ?? -1) + 1,
  });

  if (error) return falhou(traduzirErro(error));

  revalidatePath(SECTION);
  return gravou();
}

/** Nome e cor salvam separado, cada um ao seu gatilho. */
export async function updateStageStatus(
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Status não informado.");

  const patch: TablesUpdate<"stage_statuses"> = {};

  const rawLabel = formData.get("label");
  if (typeof rawLabel === "string") {
    const label = stageStatusLabelSchema.safeParse(rawLabel);
    if (label.success) patch.label = label.data;
  }

  const rawColor = formData.get("color");
  if (typeof rawColor === "string") {
    const color = stageStatusColorSchema.safeParse(rawColor);
    if (color.success) patch.color = color.data;
  }

  // Nada a mudar não é falha; a tela só não precisa fazer nada.
  if (Object.keys(patch).length === 0) return gravou();

  const supabase = await createClient();
  const estado = resultado(
    await supabase.from("stage_statuses").update(patch).eq("id", id).select("id"),
  );
  if (estado.error) return estado;

  revalidatePath(SECTION);
  return estado;
}

/**
 * Marca se este status conta como etapa concluída.
 *
 * É o que alimenta o cálculo de progresso do processo. Vários podem contar —
 * "Concluído" e "Não se aplica", por exemplo, ambos tiram a etapa do caminho.
 */
export async function toggleStageStatusDone(
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  const next = formData.get("is_done");
  if (typeof id !== "string" || typeof next !== "string") {
    return falhou("Status não informado.");
  }

  const supabase = await createClient();
  const estado = resultado(
    await supabase
      .from("stage_statuses")
      .update({ is_done: next === "true" })
      .eq("id", id)
      .select("id"),
  );
  if (estado.error) return estado;

  revalidatePath(SECTION);
  return estado;
}

/**
 * Define o status de toda etapa recém-criada.
 *
 * Vai por RPC porque são dois passos — limpar o padrão antigo e marcar o novo —
 * e o índice único não admite os dois marcados ao mesmo tempo. Feito daqui em
 * duas chamadas, uma falha no meio deixaria a organização sem padrão nenhum.
 */
export async function setDefaultStageStatus(
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Status não informado.");

  const supabase = await createClient();
  // A RPC levanta "Status não encontrado." quando o id não existe. Antes o
  // resultado inteiro era descartado, e essa exceção não chegava a ninguém.
  const estado = resultadoSemContagem(
    await supabase.rpc("set_default_stage_status", { p_id: id }),
  );
  if (estado.error) return estado;

  revalidatePath(SECTION);
  return estado;
}

export async function moveStageStatus(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const direction = formData.get("direction");
  if (typeof id !== "string" || (direction !== "up" && direction !== "down")) {
    return falhou("Movimento não informado.");
  }

  const supabase = await createClient();

  const { data: status, error: statusError } = await supabase
    .from("stage_statuses")
    .select("id, organization_id, position")
    .eq("id", id)
    .maybeSingle();

  if (statusError) return falhou(traduzirErro(statusError));
  if (!status) return falhou("Status não encontrado.");

  const { data: neighbour, error: neighbourError } = await supabase
    .from("stage_statuses")
    .select("id, position")
    .eq("organization_id", status.organization_id)
    .order("position", { ascending: direction === "down" })
    [direction === "down" ? "gt" : "lt"]("position", status.position)
    .limit(1)
    .maybeSingle();

  if (neighbourError) return falhou(traduzirErro(neighbourError));
  // Já está na ponta. Não é erro, e a tela já desabilita o botão.
  if (!neighbour) return gravou();

  const estado = resultadoSemContagem(
    await supabase.rpc("swap_positions", {
      p_tabela: "stage_statuses",
      p_a: status.id,
      p_b: neighbour.id,
    }),
  );
  if (estado.error) return estado;

  revalidatePath(SECTION);
  return estado;
}

/**
 * Exclui um status criado pela equipe.
 *
 * Os três de fábrica são barrados pelo gatilho `stage_statuses_protect_system`
 * no banco — a tela também esconde o botão, mas a garantia real está lá.
 */
export async function deleteStageStatus(
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Status não informado.");

  const supabase = await createClient();
  // O gatilho de proteção recusa os três de fábrica, em português. Antes essa
  // mensagem era descartada e o clique simplesmente não fazia nada.
  const estado = resultado(
    await supabase.from("stage_statuses").delete().eq("id", id).select("id"),
  );
  if (estado.error) return estado;

  revalidatePath(SECTION);
  return estado;
}
