import { createClient } from "@/lib/supabase/server";

import type { CampoDaFicha, Dependente } from "./schema";

/**
 * A ficha de cadastro de um contato, para a equipe: os dados, os dependentes
 * e o link mais recente. Lido no servidor, com a RLS de quem está logado.
 *
 * O erro volta junto, como nas outras leituras: falha não pode virar "sem
 * dado cadastral", que na tela é igual a um contato que ainda não preencheu.
 */

export type LinkDaFicha = {
  id: string;
  token: string;
  expires_at: string;
  cancelled_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
};

export type CadastroDoContato = {
  ficha: Record<CampoDaFicha, string | null>;
  dependentes: Dependente[];
  link: LinkDaFicha | null;
};

export async function cadastroDoContato(
  personId: string,
): Promise<{ cadastro: CadastroDoContato | null; error: string | null }> {
  const supabase = await createClient();

  const [pessoa, dependentes, link] = await Promise.all([
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
    // O mais recente que não foi cancelado: gerar um link novo cancela o
    // anterior, e ficha já recebida continua valendo até haver outro.
    supabase
      .from("registration_forms")
      .select("id, token, expires_at, cancelled_at, submitted_at, reviewed_at")
      .eq("person_id", personId)
      .is("cancelled_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const falha = pessoa.error ?? dependentes.error ?? link.error;
  if (falha) return { cadastro: null, error: falha.message };
  if (!pessoa.data) return { cadastro: null, error: null };

  return {
    error: null,
    cadastro: {
      ficha: pessoa.data,
      dependentes: (dependentes.data ?? []) as Dependente[],
      link: link.data,
    },
  };
}
