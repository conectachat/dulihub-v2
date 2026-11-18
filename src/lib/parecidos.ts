import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { ActionState } from "./action-state";
import { aparar, normalizarDdi, type Contato } from "./contato";
import { soDigitos } from "./documentos";
import { traduzirErro } from "./erros";
import { Constants, type Database, type Enums } from "./supabase/database.types";

/**
 * Contato já cadastrado (CON-4): o que a busca devolve, o que a ação manda
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

const parecidoDaCriacao = z
  .object({
    id: z.string(),
    nome: z.string(),
    estagio: z.enum(Constants.public.Enums.person_lifecycle_stage),
    na_lixeira: z.boolean(),
    bate_email: z.boolean(),
    bate_telefone: z.boolean(),
  })
  .transform(
    (p): ContatoParecido => ({
      id: p.id,
      nome: p.nome,
      estagio: p.estagio,
      naLixeira: p.na_lixeira,
      bateEmail: p.bate_email,
      bateTelefone: p.bate_telefone,
    }),
  );

const oportunidadeDaCriacao = z
  .object({
    id: z.string(),
    titulo: z.string(),
    status: z.enum(Constants.public.Enums.opportunity_status),
    criada_em: z.string(),
  })
  .transform(
    (o): OportunidadeExistente => ({
      id: o.id,
      titulo: o.titulo,
      status: o.status,
      criadaEm: o.criada_em,
    }),
  );

/**
 * A resposta de `criar_oportunidade` (0041), de `Json` para o que a tela usa.
 * Ou criou (o negócio e a pessoa), ou parou para perguntar — com os contatos
 * parecidos **ou** as oportunidades anteriores do contato; a função manda só
 * uma das listas, e a outra vem vazia.
 */
export const respostaDaCriacao = z.discriminatedUnion("situacao", [
  z.object({ situacao: z.literal("criada"), negocio: z.string(), pessoa: z.string() }),
  z.object({
    situacao: z.literal("precisa_confirmar"),
    parecidos: z.array(parecidoDaCriacao).default([]),
    oportunidades: z.array(oportunidadeDaCriacao).default([]),
  }),
]);

export type RespostaDaCriacao = z.output<typeof respostaDaCriacao>;

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
