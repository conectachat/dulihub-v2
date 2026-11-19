"use server";

import { revalidatePath } from "next/cache";

import { falhou, gravou, type ActionState } from "@/lib/action-state";
import { traduzirErro } from "@/lib/erros";
import { contextoAtual } from "@/lib/organizacao";

import { CATEGORIAS, caminhoDoDocumento } from "./regras";

/**
 * Os documentos do cliente (CLI-8): passaporte, identidade, comprovante de
 * residência, contrato. O navegador sobe o arquivo direto ao depósito
 * `pessoas` (o servidor não recebe 20 MB) e pede aqui o registro; recusado o
 * registro, a tela remove o objeto (`enviarERegistrar`, `@/lib/arquivos`).
 */

const DEPOSITO = "pessoas";

/**
 * Registra o documento que o navegador acabou de subir.
 *
 * A organização vem **da pessoa**, nunca de quem clicou (AGENTS.md). O
 * caminho é conferido contra a pessoa lida no banco, e o `check` da 0047
 * confere de novo.
 */
export async function registrarDocumento(dados: {
  pessoaId: string;
  id: string;
  caminho: string;
  nome: string;
  tipo: string | null;
  tamanho: number;
  categoria: string;
}): Promise<ActionState> {
  if (!CATEGORIAS.some((c) => c.valor === dados.categoria)) {
    return falhou("Escolha a categoria do documento.");
  }

  const { supabase, userId, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data: pessoa, error: erroPessoa } = await supabase
    .from("people")
    .select("id, organization_id")
    .eq("id", dados.pessoaId)
    .maybeSingle();
  if (erroPessoa) return falhou(traduzirErro(erroPessoa));
  if (!pessoa) return falhou("Cliente não encontrado.");

  if (dados.caminho !== caminhoDoDocumento(pessoa.organization_id, pessoa.id, dados.id, dados.nome)) {
    return falhou("O arquivo não pertence a este cliente.");
  }

  const { error } = await supabase
    .from("files")
    .insert({
      id: dados.id,
      organization_id: pessoa.organization_id,
      person_id: pessoa.id,
      bucket: DEPOSITO,
      path: dados.caminho,
      filename: dados.nome.slice(0, 255),
      mime_type: dados.tipo || null,
      size_bytes: dados.tamanho,
      category: dados.categoria,
      uploaded_by: userId,
    })
    .select("id");
  if (error) return falhou(traduzirErro(error));

  revalidatePath(`/clientes/${pessoa.id}`);
  return gravou();
}

/**
 * Endereço assinado de curta duração (5 min) para ver ou baixar, gerado com
 * a sessão de quem pede — a policy do depósito confere a organização.
 */
export async function enderecoDoDocumento(
  id: string,
  baixar = false,
): Promise<{ url: string | null; error: string | null }> {
  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return { url: null, error: erroDoContexto };

  const { data: arquivo, error } = await supabase
    .from("files")
    .select("path, filename")
    .eq("id", id)
    .maybeSingle();
  if (error) return { url: null, error: traduzirErro(error) };
  if (!arquivo) return { url: null, error: "Documento não encontrado." };

  const { data, error: erroUrl } = await supabase.storage
    .from(DEPOSITO)
    .createSignedUrl(arquivo.path, 300, baixar ? { download: arquivo.filename } : undefined);
  if (erroUrl || !data) return { url: null, error: "Não foi possível abrir o documento." };

  return { url: data.signedUrl, error: null };
}

/** Linha e objeto. O objeto sai depois: se falhar, a linha já não aponta para ele. */
export async function excluirDocumento(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Documento não informado.");

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data, error } = await supabase
    .from("files")
    .delete()
    .eq("id", id)
    .select("person_id, path");
  if (error) return falhou(traduzirErro(error));
  if (!data?.length) return falhou("Documento não encontrado.");

  // Órfão no depósito é espaço perdido, não dado exposto — a policy continua
  // valendo. Por isso a falha aqui não desfaz a exclusão.
  await supabase.storage.from(DEPOSITO).remove([data[0].path]);

  revalidatePath(`/clientes/${data[0].person_id}`);
  return gravou();
}
