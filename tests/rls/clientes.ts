import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Clientes autenticados de verdade, para a suíte de RLS.
 *
 * Faz login pelo mesmo caminho que o app usa — chave publishable, PostgREST,
 * policy aplicada no banco. Testar a policy por conexão direta seria mais
 * rápido e provaria menos: o app não fala com o Postgres, fala com o
 * PostgREST, e é lá que `select`, `update` e `delete` viram filtro.
 *
 * Contas e senhas em `tests/contas.ts`, comum à suíte de fumaça.
 */

import { EMAILS, obrigatorio, SENHAS, type Papel } from "../contas";

export { EMAILS, type Papel };

/**
 * Um cliente por papel, logado. Cada chamada cria uma sessão própria: sessão
 * compartilhada entre testes esconderia vazamento por cache.
 */
export async function entrarComo(papel: Papel): Promise<SupabaseClient> {
  const supabase = createClient(
    obrigatorio("NEXT_PUBLIC_SUPABASE_URL"),
    obrigatorio("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { error } = await supabase.auth.signInWithPassword({
    email: EMAILS[papel],
    password: obrigatorio(SENHAS[papel]),
  });

  if (error) {
    throw new Error(
      `Não entrou como ${papel} (${EMAILS[papel]}): ${error.message}. ` +
        "Confira se o usuário existe em Authentication → Users e se a senha " +
        `em ${SENHAS[papel]} está certa.`,
    );
  }

  return supabase;
}

/** Ids da fixture, buscados uma vez por arquivo de teste. */
export async function fixture(supabase: SupabaseClient) {
  const { data: pessoa, error } = await supabase
    .from("people")
    .select("id, organization_id, full_name")
    .eq("full_name", "Cliente de Teste")
    .maybeSingle();

  if (error) throw new Error(`Fixture ilegível: ${error.message}`);
  if (!pessoa) {
    throw new Error(
      "A pessoa “Cliente de Teste” não existe. Aplique a migration " +
        "0015_fixture_de_teste.sql **depois** de criar os três usuários.",
    );
  }

  return pessoa;
}
