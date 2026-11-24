import { escolherOrganizacao } from "@/lib/escolher-organizacao";
import { traduzirErro } from "@/lib/erros";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Enums } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export { escolherOrganizacao };

/**
 * De qual organização é a ação que está acontecendo.
 *
 * Existia em sete cópias, todas com o mesmo par de defeitos: `.limit(1)` sem
 * `order by`, e nenhuma filtrando por usuário. O segundo é o grave. A policy
 * `organization_members_select` deixa um membro **root** ler as linhas de
 * associação de *todas* as organizações — então, com a primeira parceira no
 * banco, `.limit(1)` sem ordem devolve uma linha qualquer, de qualquer
 * organização, e a gravação sai carimbada com a errada.
 *
 * Fica em `lib/` e não em `features/organizations/` porque é usado por três
 * features, e feature não importa de feature.
 */

/** O papel vem do enum do banco — acrescentar um papel lá aparece aqui. */
export type PapelNaOrganizacao = Enums<"member_role">;

export type ContextoDaAcao = Awaited<ReturnType<typeof contextoAtual>>;

/**
 * Cliente, usuário e organização de uma Server Action, num lugar só.
 *
 * `error` é preenchido quando a leitura falha — e ele existe para ser lido.
 * Tratar falha de leitura como "sem organização" foi o que produziu ações que
 * desistiam em silêncio.
 */
export async function contextoAtual() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
      userId: null,
      organizationId: null,
      papel: null as PapelNaOrganizacao | null,
      tipo: null as Enums<"organization_type"> | null,
      error: "Sua sessão expirou. Entre de novo.",
    };
  }

  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, created_at, organizations(type)")
    .eq("user_id", user.id);

  if (error) {
    return {
      supabase,
      userId: user.id,
      organizationId: null,
      papel: null as PapelNaOrganizacao | null,
      tipo: null as Enums<"organization_type"> | null,
      error: traduzirErro(error),
    };
  }

  const escolhida = escolherOrganizacao(data ?? []);

  return {
    supabase,
    userId: user.id,
    organizationId: escolhida?.organization_id ?? null,
    papel: escolhida?.role ?? null,
    /** O tipo da organização atual: com o papel, diz quem é dono da raiz. */
    tipo: (escolhida?.organizations?.type ?? null) as Enums<"organization_type"> | null,
    error: null as string | null,
  };
}

/** A frase única para quem chegou sem organização. */
export const SEM_ORGANIZACAO =
  "Sua conta não está vinculada a nenhuma organização.";

/**
 * "É da gestão": `owner` ou `admin` — a mesma regra de
 * `private.current_user_manages`, que o banco aplica de novo. Na tela, decide
 * só o que aparece; quem decide de verdade é o banco.
 */
export function ehDaGestao(papel: PapelNaOrganizacao | null | undefined): boolean {
  return papel === "owner" || papel === "admin";
}

/**
 * Se quem chama é da gestão da organização **do registro** (contato,
 * negócio) — que pode não ser a organização atual. Erro de leitura volta como
 * erro, nunca como "não é da gestão".
 */
export async function daGestaoDe(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  userId: string | null,
): Promise<{ daGestao: boolean; error: string | null }> {
  if (!userId) return { daGestao: false, error: null };

  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { daGestao: false, error: error.message };
  return { daGestao: ehDaGestao(data?.role), error: null };
}
