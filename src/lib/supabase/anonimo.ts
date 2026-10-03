import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/**
 * Cliente **sem sessão**, para a única coisa que o app faz por quem não tem
 * login: a ficha de cadastro por link (`/cadastro/<token>`).
 *
 * Não lê cookie de propósito. A porta do lead no banco (0035) só aceita o
 * papel `anon`: se a página pública usasse o cliente de `server.ts`, alguém
 * da equipe que abrisse o link logado chamaria a função como `authenticated`
 * e seria recusado — e um cliente do portal, logado, teria o CPF congelado
 * pelo gatilho da 0013. Sem cookie, quem preenche é sempre o anônimo, seja
 * quem for que esteja com o navegador aberto.
 *
 * Com a chave publishable, como todos os outros: este cliente não enxerga
 * tabela nenhuma (nenhuma policy é `to anon`), só as duas funções da ficha.
 * Só para uso no servidor.
 */
export function clienteAnonimo() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
