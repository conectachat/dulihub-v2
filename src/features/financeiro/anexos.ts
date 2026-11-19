import type { SupabaseClient } from "@supabase/supabase-js";

import { falhou, gravou, type ActionState } from "@/lib/action-state";
import { arquivoAceito, enviarERegistrar } from "@/lib/arquivos";
import { traduzirErro } from "@/lib/erros";
import type { Database, Tables } from "@/lib/supabase/database.types";

import { caminhoDoAnexo } from "./regras";

/**
 * Anexos da parcela (CLI-6): boleto, nota fiscal, comprovante.
 *
 * Exceção registrada no `AGENTS.md`: a tela Financeiro é migrada e não tem
 * Server Action, então os anexos vão **direto do navegador** — o objeto ao
 * depósito `financeiro`, a linha a `installment_files` —, com a sessão de
 * quem clica e a RLS decidindo. Ficam fora do espelho: só com internet.
 *
 * O banco confere o caminho contra a parcela real (0048) e recusa apagar
 * parcela ou cobrança que ainda tem anexo, para nenhum objeto ficar órfão.
 */

type Banco = SupabaseClient<Database>;

const DEPOSITO = "financeiro";

export const TIPOS_DE_ANEXO = [
  { valor: "boleto", rotulo: "Boleto" },
  { valor: "nota_fiscal", rotulo: "Nota fiscal" },
  { valor: "comprovante", rotulo: "Comprovante" },
  { valor: "outro", rotulo: "Outro" },
] as const;

export type Anexo = Pick<
  Tables<"installment_files">,
  "id" | "installment_id" | "kind" | "filename" | "storage_path" | "created_at"
>;

/** Os anexos de várias parcelas numa consulta só. */
export async function anexosDasParcelas(
  supabase: Banco,
  parcelas: string[],
): Promise<{ anexos: Anexo[]; error: string | null }> {
  if (parcelas.length === 0) return { anexos: [], error: null };

  const { data, error } = await supabase
    .from("installment_files")
    .select("id, installment_id, kind, filename, storage_path, created_at")
    .in("installment_id", parcelas)
    .order("created_at");
  if (error) return { anexos: [], error: traduzirErro(error) };
  return { anexos: data ?? [], error: null };
}

/**
 * Sobe o arquivo e registra a linha; linha recusada remove o objeto. A
 * organização é a da cobrança — a mesma da parcela, pela chave composta —,
 * nunca a de quem clicou.
 */
export async function anexar(
  supabase: Banco,
  alvo: {
    organizacao: string;
    pessoa: string;
    cobranca: string;
    parcela: string;
    tipo: string;
    arquivo: File;
  },
): Promise<ActionState> {
  const { arquivo } = alvo;
  const aceito = arquivoAceito(arquivo);
  if (!aceito.ok) return falhou(aceito.erro);

  const id = crypto.randomUUID();
  const caminho = caminhoDoAnexo({ ...alvo, id, nome: arquivo.name });

  const { error } = await enviarERegistrar(supabase.storage, DEPOSITO, caminho, arquivo, async () => {
    const { error: erro } = await supabase.from("installment_files").insert({
      id,
      organization_id: alvo.organizacao,
      installment_id: alvo.parcela,
      kind: alvo.tipo,
      filename: arquivo.name.slice(0, 255),
      storage_path: caminho,
      mime_type: arquivo.type || null,
      size_bytes: arquivo.size,
    });
    return { error: erro ? traduzirErro(erro) : null };
  });

  return error ? falhou(error) : gravou();
}

/** Linha e depois objeto: se a linha não sai, o objeto continua apontado. */
export async function removerAnexo(supabase: Banco, id: string): Promise<ActionState> {
  const { data, error } = await supabase
    .from("installment_files")
    .delete()
    .eq("id", id)
    .select("storage_path");
  if (error) return falhou(traduzirErro(error));
  if (!data?.length) return falhou("Anexo não encontrado.");

  // Órfão no depósito é espaço perdido, não dado exposto: a falha aqui não
  // desfaz a remoção.
  await supabase.storage.from(DEPOSITO).remove([data[0].storage_path]);
  return gravou();
}

/** Endereço assinado de 5 minutos, para ver ou baixar. */
export async function enderecoDoAnexo(
  supabase: Banco,
  anexo: Pick<Anexo, "storage_path" | "filename">,
  baixar: boolean,
): Promise<string | null> {
  const { data } = await supabase.storage
    .from(DEPOSITO)
    .createSignedUrl(anexo.storage_path, 300, baixar ? { download: anexo.filename } : undefined);
  return data?.signedUrl ?? null;
}
