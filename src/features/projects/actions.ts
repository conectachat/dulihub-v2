"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { falhou, gravou, type ActionState } from "@/lib/action-state";
import { traduzirErro } from "@/lib/erros";
import { hojeEmSaoPaulo } from "@/lib/formatar";
import { resultado, resultadoSemContagem } from "@/lib/gravar";
import { contextoAtual } from "@/lib/organizacao";
import type { TablesUpdate } from "@/lib/supabase/database.types";

import { campoDaEtapa, campoDoProcesso, datasDaEtapa } from "./campos";
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

// ------------------------------------------------------------ etapas no processo

/**
 * Nome, data prevista ou data de conclusão de uma etapa.
 *
 * A conclusão só se corrige com a etapa concluída: numa etapa em andamento a
 * data ficaria gravada sem significado, e reapareceria ao concluir.
 */
export async function atualizarEtapa(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const campo = formData.get("campo");
  const valor = formData.get("valor");
  if (typeof id !== "string" || typeof campo !== "string") {
    return falhou("Etapa não informada.");
  }

  const validado = campoDaEtapa(campo, typeof valor === "string" ? valor : "");
  if (!validado.ok) return falhou(validado.erro);

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data: etapa, error: erroEtapa } = await supabase
    .from("project_stages")
    .select("project_id, status:stage_statuses!project_stages_status_same_org(is_done)")
    .eq("id", id)
    .maybeSingle();
  if (erroEtapa) return falhou(traduzirErro(erroEtapa));
  if (!etapa) return falhou("Etapa não encontrada.");

  if (validado.campo === "completed_on" && !etapa.status?.is_done) {
    return falhou("A data de conclusão só vale para etapa concluída.");
  }

  const alteracao = { [validado.campo]: validado.valor } as TablesUpdate<"project_stages">;

  const estado = resultado(
    await supabase.from("project_stages").update(alteracao).eq("id", id).select("id"),
  );
  if (estado.error) return estado;

  revalidatePath(`/projetos/${etapa.project_id}`);
  return estado;
}

/**
 * Etapa criada só neste processo — raiz ou sub-etapa.
 *
 * Organização e processo vêm **do processo** lido no banco, não do
 * formulário. Nasce com o status padrão e sem `source_stage_id`: é isso que a
 * tela mostra como "só deste processo".
 */
export async function criarEtapa(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectId = formData.get("project_id");
  const nome = formData.get("name");
  const rawParent = formData.get("parent_id");
  const parentId = typeof rawParent === "string" && rawParent ? rawParent : null;

  if (typeof projectId !== "string") return falhou("Processo não informado.");
  const validado = campoDaEtapa("name", typeof nome === "string" ? nome : "");
  if (!validado.ok) return falhou(validado.erro);

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data: processo, error: erroProcesso } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .maybeSingle();
  if (erroProcesso) return falhou(traduzirErro(erroProcesso));
  if (!processo) return falhou("Processo não encontrado.");

  let irmas = supabase
    .from("project_stages")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1);
  irmas = parentId ? irmas.eq("parent_id", parentId) : irmas.is("parent_id", null);

  const [{ data: ultima, error: erroIrmas }, { data: padrao, error: erroPadrao }] =
    await Promise.all([
      irmas,
      supabase
        .from("stage_statuses")
        .select("id")
        .eq("organization_id", processo.organization_id)
        .eq("is_default", true)
        .maybeSingle(),
    ]);
  if (erroIrmas ?? erroPadrao) return falhou(traduzirErro(erroIrmas ?? erroPadrao));
  if (!padrao) return falhou("A organização não tem status de etapa padrão.");

  const estado = resultado(
    await supabase
      .from("project_stages")
      .insert({
        organization_id: processo.organization_id,
        project_id: projectId,
        parent_id: parentId,
        name: validado.valor!,
        position: (ultima?.[0]?.position ?? -1) + 1,
        status_id: padrao.id,
      })
      .select("id"),
  );
  if (estado.error) return estado;

  revalidatePath(`/projetos/${projectId}`);
  return estado;
}

/** Sobe ou desce entre as irmãs, pela troca atômica da 0014. */
export async function moverEtapa(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const direcao = formData.get("direction");
  if (typeof id !== "string" || (direcao !== "up" && direcao !== "down")) {
    return falhou("Movimento não informado.");
  }

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data: etapa, error: erroEtapa } = await supabase
    .from("project_stages")
    .select("id, project_id, parent_id, position")
    .eq("id", id)
    .maybeSingle();
  if (erroEtapa) return falhou(traduzirErro(erroEtapa));
  if (!etapa) return falhou("Etapa não encontrada.");

  let vizinha = supabase
    .from("project_stages")
    .select("id")
    .eq("project_id", etapa.project_id)
    .order("position", { ascending: direcao === "down" })
    .limit(1);
  vizinha = etapa.parent_id
    ? vizinha.eq("parent_id", etapa.parent_id)
    : vizinha.is("parent_id", null);

  const { data: outra, error: erroOutra } = await vizinha[
    direcao === "down" ? "gt" : "lt"
  ]("position", etapa.position).maybeSingle();
  if (erroOutra) return falhou(traduzirErro(erroOutra));
  // Já na ponta: a tela desabilita o botão, e não é erro.
  if (!outra) return gravou();

  const estado = resultadoSemContagem(
    // `swap_positions` e não `reordenar_irmaos`: esta tela ainda grava pelo
    // servidor, com a resposta na mão. A troca pela ordem absoluta acontece
    // quando o processo for para o espelho — antes disso não há fila para
    // reproduzir nada, e mudar as duas coisas de uma vez esconderia qual
    // delas quebrou.
    await supabase.rpc("swap_positions", {
      p_tabela: "project_stages",
      p_a: etapa.id,
      p_b: outra.id,
    }),
  );
  if (estado.error) return estado;

  revalidatePath(`/projetos/${etapa.project_id}`);
  return estado;
}

/** Exclui a etapa; a chave em cascata leva as sub-etapas junto. */
export async function excluirEtapa(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Etapa não informada.");

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data, error } = await supabase
    .from("project_stages")
    .delete()
    .eq("id", id)
    .select("project_id");
  const estado = resultado({ data, error });
  if (estado.error) return estado;

  revalidatePath(`/projetos/${data![0].project_id}`);
  return estado;
}
