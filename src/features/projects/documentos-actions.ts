"use server";

import { revalidatePath } from "next/cache";

import { falhou, gravou, type ActionState } from "@/lib/action-state";
import { traduzirErro } from "@/lib/erros";
import { resultado, resultadoSemContagem } from "@/lib/gravar";
import { contextoAtual } from "@/lib/organizacao";
import type { TablesUpdate } from "@/lib/supabase/database.types";

import { campoDaEtapa } from "./campos";
import { caminhoPertence, motivoDeRecusa } from "./regras";

/**
 * Pastas e arquivos do processo (aba Documentos).
 *
 * Organização e processo vêm sempre **do banco** — da pasta ou do processo
 * lidos com a RLS de quem pede —, nunca do formulário. Toda gravação leva
 * `.select("id")`: a RLS esconde sem erro, e zero linhas é recusa.
 */

const revalidar = (projetoId: string) => revalidatePath(`/projetos/${projetoId}`);

// ------------------------------------------------------------------ pastas

/** Pasta criada só neste processo: sem origem no catálogo e, de saída, opcional. */
export async function criarPasta(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectId = formData.get("project_id");
  const nome = formData.get("name");
  const bruto = formData.get("parent_id");
  const parentId = typeof bruto === "string" && bruto ? bruto : null;
  if (typeof projectId !== "string") return falhou("Processo não informado.");

  const validado = campoDaEtapa("name", typeof nome === "string" ? nome : "");
  if (!validado.ok) return falhou("Informe o nome da pasta.");

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
    .from("project_documents")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1);
  irmas = parentId ? irmas.eq("parent_id", parentId) : irmas.is("parent_id", null);
  const { data: ultima, error: erroIrmas } = await irmas;
  if (erroIrmas) return falhou(traduzirErro(erroIrmas));

  const estado = resultado(
    await supabase
      .from("project_documents")
      .insert({
        organization_id: processo.organization_id,
        project_id: projectId,
        parent_id: parentId,
        name: validado.valor!,
        position: (ultima?.[0]?.position ?? -1) + 1,
        is_required: false,
      })
      .select("id"),
  );
  if (estado.error) return estado;

  revalidar(projectId);
  return estado;
}

/** Nome, prazo ou obrigatoriedade — um campo por vez, lista fechada. */
export async function atualizarPasta(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const campo = formData.get("campo");
  const valor = formData.get("valor");
  if (typeof id !== "string" || typeof campo !== "string" || typeof valor !== "string") {
    return falhou("Pasta não informada.");
  }

  let alteracao: TablesUpdate<"project_documents">;
  if (campo === "name") {
    const v = campoDaEtapa("name", valor);
    if (!v.ok) return falhou("Informe o nome da pasta.");
    alteracao = { name: v.valor! };
  } else if (campo === "deadline_on") {
    // Mesma validação de data da etapa.
    const v = campoDaEtapa("due_on", valor);
    if (!v.ok) return falhou(v.erro);
    alteracao = { deadline_on: v.valor };
  } else if (campo === "is_required") {
    alteracao = { is_required: valor === "true" };
  } else {
    return falhou("Campo não editável.");
  }

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data, error } = await supabase
    .from("project_documents")
    .update(alteracao)
    .eq("id", id)
    .select("project_id");
  const estado = resultado({ data, error });
  if (estado.error) return estado;

  revalidar(data![0].project_id);
  return estado;
}

/** Marca ou desmarca resolvida. O gatilho da 0026 recusa com pendência. */
export async function resolverPasta(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const resolver = formData.get("resolver") === "true";
  if (typeof id !== "string") return falhou("Pasta não informada.");

  const { supabase, userId, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data, error } = await supabase
    .from("project_documents")
    .update(
      resolver
        ? { resolved_at: new Date().toISOString(), resolved_by: userId }
        : { resolved_at: null, resolved_by: null },
    )
    .eq("id", id)
    .select("project_id");
  const estado = resultado({ data, error });
  if (estado.error) return estado;

  revalidar(data![0].project_id);
  revalidatePath("/projetos");
  return estado;
}

export async function moverPasta(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const direcao = formData.get("direction");
  if (typeof id !== "string" || (direcao !== "up" && direcao !== "down")) {
    return falhou("Movimento não informado.");
  }

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data: pasta, error: erroPasta } = await supabase
    .from("project_documents")
    .select("id, project_id, parent_id, position")
    .eq("id", id)
    .maybeSingle();
  if (erroPasta) return falhou(traduzirErro(erroPasta));
  if (!pasta) return falhou("Pasta não encontrada.");

  let vizinha = supabase
    .from("project_documents")
    .select("id")
    .eq("project_id", pasta.project_id)
    .order("position", { ascending: direcao === "down" })
    .limit(1);
  vizinha = pasta.parent_id
    ? vizinha.eq("parent_id", pasta.parent_id)
    : vizinha.is("parent_id", null);
  const { data: outra, error: erroOutra } = await vizinha[
    direcao === "down" ? "gt" : "lt"
  ]("position", pasta.position).maybeSingle();
  if (erroOutra) return falhou(traduzirErro(erroOutra));
  if (!outra) return gravou();

  const estado = resultadoSemContagem(
    // `swap_positions` e não `reordenar_irmaos`: esta tela ainda grava pelo
    // servidor, com a resposta na mão. A troca pela ordem absoluta acontece
    // quando o processo for para o espelho — antes disso não há fila para
    // reproduzir nada, e mudar as duas coisas de uma vez esconderia qual
    // delas quebrou.
    await supabase.rpc("swap_positions", {
      p_tabela: "project_documents",
      p_a: pasta.id,
      p_b: outra.id,
    }),
  );
  if (estado.error) return estado;

  revalidar(pasta.project_id);
  return estado;
}

/**
 * Exclui a pasta, as subpastas e os arquivos delas.
 *
 * Os objetos do Storage saem **antes**: a linha some em cascata, mas o
 * arquivo no bucket não — ficaria órfão, ocupando espaço e sem ninguém
 * saber que existe.
 */
export async function excluirPasta(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Pasta não informada.");

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data: pasta, error: erroPasta } = await supabase
    .from("project_documents")
    .select("project_id")
    .eq("id", id)
    .maybeSingle();
  if (erroPasta) return falhou(traduzirErro(erroPasta));
  if (!pasta) return falhou("Pasta não encontrada.");

  const { data: todas, error: erroTodas } = await supabase
    .from("project_documents")
    .select("id, parent_id")
    .eq("project_id", pasta.project_id);
  if (erroTodas) return falhou(traduzirErro(erroTodas));

  const alvo = new Set([id]);
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (const p of todas ?? []) {
      if (p.parent_id && alvo.has(p.parent_id) && !alvo.has(p.id)) {
        alvo.add(p.id);
        mudou = true;
      }
    }
  }

  const { data: arquivos, error: erroArquivos } = await supabase
    .from("document_files")
    .select("storage_path")
    .in("project_document_id", [...alvo]);
  if (erroArquivos) return falhou(traduzirErro(erroArquivos));

  if (arquivos?.length) {
    const { error } = await supabase.storage
      .from("documentos")
      .remove(arquivos.map((a) => a.storage_path));
    if (error) return falhou("Não foi possível apagar os arquivos da pasta. Nada foi excluído.");
  }

  const estado = resultado(
    await supabase.from("project_documents").delete().eq("id", id).select("id"),
  );
  if (estado.error) return estado;

  revalidar(pasta.project_id);
  revalidatePath("/projetos");
  return estado;
}

// ---------------------------------------------------------------- arquivos

/**
 * Registra o arquivo que o navegador acabou de subir direto no Storage.
 *
 * O servidor não confia no caminho recebido: confere contra a pasta lida no
 * banco (`caminhoPertence`) — e o check da 0020 confere de novo. Se recusar,
 * a tela apaga o objeto que subiu.
 */
export async function registrarArquivo(dados: {
  pastaId: string;
  caminho: string;
  nome: string;
  tipo: string | null;
  tamanho: number;
}): Promise<ActionState> {
  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data: pasta, error: erroPasta } = await supabase
    .from("project_documents")
    .select("id, project_id, organization_id")
    .eq("id", dados.pastaId)
    .maybeSingle();
  if (erroPasta) return falhou(traduzirErro(erroPasta));
  if (!pasta) return falhou("Pasta não encontrada.");

  if (
    !caminhoPertence(dados.caminho, {
      organizacao: pasta.organization_id,
      processo: pasta.project_id,
      pasta: pasta.id,
    })
  ) {
    return falhou("O arquivo não pertence a esta pasta.");
  }

  const estado = resultado(
    await supabase
      .from("document_files")
      .insert({
        organization_id: pasta.organization_id,
        project_id: pasta.project_id,
        project_document_id: pasta.id,
        storage_path: dados.caminho,
        file_name: dados.nome.slice(0, 255),
        mime_type: dados.tipo || null,
        size_bytes: dados.tamanho,
      })
      .select("id"),
  );
  if (estado.error) return estado;

  revalidar(pasta.project_id);
  revalidatePath("/projetos");
  return estado;
}

export async function aprovarArquivo(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Arquivo não informado.");

  const { supabase, userId, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data, error } = await supabase
    .from("document_files")
    .update({
      review_status: "approved",
      rejection_reason: null,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("project_id");
  const estado = resultado({ data, error });
  if (estado.error) return estado;

  revalidar(data![0].project_id);
  return estado;
}

export async function recusarArquivo(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  const texto = formData.get("motivo");
  if (typeof id !== "string") return falhou("Arquivo não informado.");

  const motivo = motivoDeRecusa(typeof texto === "string" ? texto : "");
  if (!motivo.ok) return falhou(motivo.erro);

  const { supabase, userId, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data, error } = await supabase
    .from("document_files")
    .update({
      review_status: "rejected",
      rejection_reason: motivo.motivo,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("project_id");
  const estado = resultado({ data, error });
  if (estado.error) return estado;

  revalidar(data![0].project_id);
  revalidatePath("/projetos");
  return estado;
}

/** Linha e objeto. O objeto sai depois: se falhar, a linha já não aponta para ele. */
export async function excluirArquivo(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Arquivo não informado.");

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data, error } = await supabase
    .from("document_files")
    .delete()
    .eq("id", id)
    .select("project_id, storage_path");
  const estado = resultado({ data, error });
  if (estado.error) return estado;

  // Órfão no bucket é espaço perdido, não dado exposto — a policy continua
  // valendo. Por isso a falha aqui não desfaz a exclusão.
  await supabase.storage.from("documentos").remove([data![0].storage_path]);

  revalidar(data![0].project_id);
  revalidatePath("/projetos");
  return estado;
}

/**
 * Endereço assinado de curta duração para ver ou baixar, gerado com a RLS de
 * quem pede — a policy do bucket confere a organização.
 */
export async function enderecoDoArquivo(
  id: string,
  baixar = false,
): Promise<{ url: string | null; error: string | null }> {
  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return { url: null, error: erroDoContexto };

  const { data: arquivo, error } = await supabase
    .from("document_files")
    .select("storage_path, file_name")
    .eq("id", id)
    .maybeSingle();
  if (error) return { url: null, error: traduzirErro(error) };
  if (!arquivo) return { url: null, error: "Arquivo não encontrado." };

  const { data, error: erroUrl } = await supabase.storage
    .from("documentos")
    .createSignedUrl(arquivo.storage_path, 300, baixar ? { download: arquivo.file_name } : undefined);
  if (erroUrl || !data) return { url: null, error: "Não foi possível abrir o arquivo." };

  return { url: data.signedUrl, error: null };
}
