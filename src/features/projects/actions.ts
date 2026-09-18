"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { falhou, type ActionState } from "@/lib/action-state";
import { traduzirErro } from "@/lib/erros";
import { hojeEmSaoPaulo } from "@/lib/formatar";
import { resultado } from "@/lib/gravar";
import { contextoAtual } from "@/lib/organizacao";
import type { TablesUpdate } from "@/lib/supabase/database.types";

import { campoDoProcesso, datasDaEtapa } from "./campos";
import { processoFromForm } from "./schema";

/**
 * Cria o processo a partir do tipo de visto e leva direto para ele.
 *
 * A cópia das etapas e das pastas é toda do banco (`criar_processo`, numa
 * transação só): aqui só se valida o formulário e se chama a função. A
 * organização também vem de lá — da pessoa, não de quem clicou.
 */
export async function criarProcesso(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = processoFromForm(formData);
  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { person_id, visa_type_id, title, opportunity_id } = parsed.data;

  const { data: id, error } = await supabase.rpc("criar_processo", {
    p_person: person_id,
    p_visa_type: visa_type_id,
    p_title: title,
    ...(opportunity_id ? { p_opportunity: opportunity_id } : {}),
  });

  if (error) return falhou(traduzirErro(error));
  if (!id) return falhou("O processo não foi criado. Tente de novo.");

  revalidatePath("/projetos");
  revalidatePath(`/contatos/${person_id}`);
  revalidatePath("/crm");

  // Fora de try/catch: `redirect` funciona lançando, e capturá-lo engoliria
  // a navegação.
  redirect(`/projetos/${id}`);
}

/**
 * Um campo do processo, editado no lugar: status, recibo do USCIS e datas.
 *
 * O nome do campo vem do formulário; `campoDoProcesso` só deixa passar os da
 * lista. `.select("id")` porque a RLS esconde sem erro — zero linhas é recusa.
 */
export async function atualizarProcesso(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const campo = formData.get("campo");
  const valor = formData.get("valor");
  if (typeof id !== "string" || typeof campo !== "string") {
    return falhou("Processo não informado.");
  }

  const validado = campoDoProcesso(campo, typeof valor === "string" ? valor : "");
  if (!validado.ok) return falhou(validado.erro);

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  // Chave calculada: o TypeScript não liga o nome ao tipo da coluna. A lista
  // fechada de `campoDoProcesso` é que garante — e só `status` é obrigatório,
  // e para ele o vazio nunca passa.
  const alteracao = { [validado.campo]: validado.valor } as TablesUpdate<"projects">;

  const estado = resultado(
    await supabase
      .from("projects")
      .update(alteracao)
      .eq("id", id)
      .select("id"),
  );
  if (estado.error) return estado;

  revalidatePath(`/projetos/${id}`);
  revalidatePath("/projetos");
  return estado;
}

/**
 * Troca o status de uma etapa, e as datas acompanham (`datasDaEtapa`).
 *
 * O status é conferido no banco, não no formulário: é de lá que vem se ele é
 * o padrão ou o de concluída.
 */
export async function mudarStatusDaEtapa(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const statusId = formData.get("status_id");
  if (typeof id !== "string" || typeof statusId !== "string") {
    return falhou("Etapa não informada.");
  }

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const [
    { data: etapa, error: erroEtapa },
    { data: status, error: erroStatus },
  ] = await Promise.all([
    supabase
      .from("project_stages")
      .select("project_id, started_on, completed_on")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("stage_statuses")
      .select("is_default, is_done")
      .eq("id", statusId)
      .maybeSingle(),
  ]);

  if (erroEtapa ?? erroStatus) return falhou(traduzirErro(erroEtapa ?? erroStatus));
  if (!etapa) return falhou("Etapa não encontrada.");
  if (!status) return falhou("Status não encontrado.");

  const estado = resultado(
    await supabase
      .from("project_stages")
      .update({
        status_id: statusId,
        ...datasDaEtapa(status, etapa, hojeEmSaoPaulo()),
      })
      .eq("id", id)
      .select("id"),
  );
  if (estado.error) return estado;

  revalidatePath(`/projetos/${etapa.project_id}`);
  return estado;
}
