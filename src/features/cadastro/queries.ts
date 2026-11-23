import { createClient } from "@/lib/supabase/server";

import { fichaRecebida, linkAtual, type LinkLido } from "./regras";
import type { CampoDaFicha, Dependente } from "./schema";

/**
 * A ficha de cadastro de um contato, para a equipe: os dados, os dependentes,
 * a ficha recebida e o link atual — separados desde a 4b (I4). Lido no servidor, com a RLS de quem está logado.
 *
 * O erro volta junto, como nas outras leituras: falha não pode virar "sem
 * dado cadastral", que na tela é igual a um contato que ainda não preencheu.
 */

export type LinkDaFicha = LinkLido & {
  id: string;
  token: string;
  mode: "completa" | "so_pagamento";
  /** O negócio da forma, no link com a forma de pagamento (4b). Nulo: ficha comum. */
  negocio: { id: string; title: string } | null;
};

export type CadastroDoContato = {
  ficha: Record<CampoDaFicha, string | null>;
  dependentes: Dependente[];
  /** A ficha com os dados do cliente, até o "Conferi" (I4): um link novo não a esconde. */
  fichaRecebida: LinkDaFicha | null;
  /** O link ainda aberto, vencido ou não: o comum ou o com a forma. */
  linkAtual: LinkDaFicha | null;
};

/** Os links mais recentes bastam: a ficha recebida e o link atual saem deles. */
const LINKS_LIDOS = 20;

export async function cadastroDoContato(
  personId: string,
): Promise<{ cadastro: CadastroDoContato | null; error: string | null }> {
  const supabase = await createClient();

  const [pessoa, dependentes, links] = await Promise.all([
    supabase
      .from("people")
      .select(
        `full_name, birth_date, gender, marital_status, birthplace, nationality,
         tax_id, national_id, national_id_issuer, email, phone_country_code, phone,
         address_street, address_number, address_complement, address_district,
         address_city, address_state, address_country, address_postal_code`,
      )
      .eq("id", personId)
      .maybeSingle(),
    supabase
      .from("person_dependents")
      .select("full_name, relationship, birth_date, birth_country")
      .eq("person_id", personId)
      .order("position"),
    // Os links da pessoa, com o negócio da forma quando é o link com a forma.
    // A ficha recebida e o link atual se escolhem em `regras.ts`.
    supabase
      .from("registration_forms")
      .select(
        `id, token, mode, created_at, expires_at, cancelled_at, submitted_at, reviewed_at, closed_at,
         plano:payment_plans!registration_forms_plan_same_org(
           negocio:opportunities!payment_plans_opportunity_same_org(id, title))`,
      )
      .eq("person_id", personId)
      .order("created_at", { ascending: false })
      .limit(LINKS_LIDOS),
  ]);

  const falha = pessoa.error ?? dependentes.error ?? links.error;
  if (falha) return { cadastro: null, error: falha.message };
  if (!pessoa.data) return { cadastro: null, error: null };

  const lidos: LinkDaFicha[] = (links.data ?? []).map(({ plano, mode, ...l }) => ({
    ...l,
    mode: mode === "so_pagamento" ? "so_pagamento" : "completa",
    negocio: plano?.negocio ?? null,
  }));

  return {
    error: null,
    cadastro: {
      ficha: pessoa.data,
      dependentes: (dependentes.data ?? []) as Dependente[],
      fichaRecebida: fichaRecebida(lidos),
      linkAtual: linkAtual(lidos),
    },
  };
}
