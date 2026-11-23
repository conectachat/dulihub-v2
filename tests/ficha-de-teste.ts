import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { obrigatorio } from "./contas";

/**
 * O que os testes da ficha de cadastro precisam, num lugar só: a suíte de RLS
 * (a ficha, o link com a forma, a porta do pagamento) e a fumaça.
 */

/** Sem sessão: é como a ficha pública chama o banco (`clienteAnonimo`). */
export const anonimoDeTeste = () =>
  createClient<Database>(
    obrigatorio("NEXT_PUBLIC_SUPABASE_URL"),
    obrigatorio("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

/** A ficha inteira, como o formulário público a envia. */
export const fichaCompleta = (nome: string) => ({
  full_name: nome,
  birth_date: "1990-05-20",
  tax_id: "529.982.247-25",
  national_id: "1234567",
  national_id_issuer: "SSP/MA",
  gender: "feminino",
  marital_status: "casado",
  birthplace: "São Luís",
  nationality: "Brasileira",
  email: "lead-da-ficha@example.com",
  phone_country_code: "+55",
  phone: "98999990000",
  address_street: "Rua da Filosofia",
  address_number: "10",
  address_complement: "",
  address_district: "Cohafuma",
  address_city: "São Luís",
  address_state: "MA",
  address_country: "Brasil",
  address_postal_code: "65000-000",
  dependents: [
    {
      full_name: "Filho de Teste",
      relationship: "child",
      birth_date: "2015-01-10",
      birth_country: "Brasil",
    },
  ],
});

export const ACEITE = "Declaro que as informações acima são verdadeiras.";
