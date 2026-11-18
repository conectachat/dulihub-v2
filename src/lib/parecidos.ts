import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActionState } from "./action-state";
import { aparar, normalizarDdi, type Contato } from "./contato";
import { soDigitos } from "./documentos";
import { traduzirErro } from "./erros";
import type { Database, Enums } from "./supabase/database.types";

/**
 * Contato já cadastrado (CON-8): o que a busca devolve, o que a ação manda
 * para a tela, e o nome do campo que confirma "é outra pessoa, grave mesmo
 * assim".
 *
 * Mora em `lib/` porque contato, ficha e oportunidade usam o mesmo aviso — e
 * uma feature não importa de outra.
 */

export type ContatoParecido = {
  id: string;
  nome: string;
  estagio: Enums<"person_lifecycle_stage">;
  naLixeira: boolean;
  bateEmail: boolean;
  bateTelefone: boolean;
};

export type OportunidadeExistente = {
  id: string;
  titulo: string;
  status: Enums<"opportunity_status">;
  /** timestamptz em ISO. */
  criadaEm: string;
};

/**
 * A resposta de uma ação que pode parar para perguntar. Com `parecidos` (ou
 * `oportunidades`) e sem `ok`, **não gravou**: a tela mostra o aviso, e a
 * confirmação reenvia o mesmo formulário com o campo de confirmação.
 */
export type EstadoComConfirmacao = ActionState & {
  parecidos?: ContatoParecido[];
  oportunidades?: OportunidadeExistente[];
};

/**
 * A confirmação só existe no clique: é acrescentada ao reenvio, nunca é um
 * campo do formulário — senão ela sobreviveria a uma troca de e-mail e
 * confirmaria um parecido que ninguém viu.
 */
export const CAMPO_CONFIRMAR_PARECIDO = "confirmar_contato_parecido";
export const CAMPO_CONFIRMAR_OPORTUNIDADE = "confirmar_outra_oportunidade";

/**
 * Quem já tem o mesmo e-mail ou telefone, pela RPC `contatos_parecidos` (0040).
 * A RLS de quem chama decide quem aparece; `ignorar` tira o próprio contato
 * na edição.
 */
export async function buscarParecidos(
  supabase: SupabaseClient<Database>,
  c: Contato & { ignorar?: string },
): Promise<{ parecidos: ContatoParecido[]; error: string | null }> {
  const { data, error } = await supabase.rpc("contatos_parecidos", {
    p_email: c.email ?? "",
    p_ddi: c.ddi ?? "",
    p_telefone: c.telefone ?? "",
    ...(c.ignorar ? { p_ignorar: c.ignorar } : {}),
  });
  if (error) return { parecidos: [], error: traduzirErro(error) };

  return {
    parecidos: (data ?? []).map((linha) => ({
      id: linha.id,
      nome: linha.full_name,
      estagio: linha.lifecycle_stage,
      naLixeira: linha.na_lixeira,
      bateEmail: linha.bate_email,
      bateTelefone: linha.bate_telefone,
    })),
    error: null,
  };
}

/**
 * O e-mail, o DDI ou o telefone mudaram de verdade? Compara normalizado:
 * e-mail aparado e sem maiúscula, DDI com o "+", telefone só nos dígitos.
 * Redigitar a máscara não é mudança — e não dispara o aviso na edição.
 */
export function contatoMudou(antes: Contato, depois: Contato): boolean {
  const email = (v: string | null) => aparar(v)?.toLowerCase() ?? null;
  return (
    email(antes.email) !== email(depois.email) ||
    normalizarDdi(antes.ddi) !== normalizarDdi(depois.ddi) ||
    soDigitos(antes.telefone) !== soDigitos(depois.telefone)
  );
}
