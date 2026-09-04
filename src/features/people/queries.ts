import { createClient } from "@/lib/supabase/server";

export type PersonTag = { id: string; name: string; color: string | null };

export type PersonListItem = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  phone_country_code: string | null;
  lifecycle_stage: "contact" | "opportunity" | "client";
  created_at: string;
  deleted_at: string | null;
  tags: PersonTag[];
  /** Quantas oportunidades a pessoa tem. É o número do ícone de maleta. */
  opportunity_count: number;
};

export type ListPeopleParams = {
  search?: string;
  tagIds?: string[];
  /** "ativos" esconde os excluídos; "excluidos" mostra só eles. */
  view?: "ativos" | "excluidos";
};

/**
 * Lista de contatos com tags e contagem de oportunidades.
 *
 * Não filtra por organização: quem faz isso é a RLS. Repetir o filtro aqui
 * daria falsa sensação de segurança e esconderia erro de policy.
 */
export async function listPeople({
  search,
  tagIds,
  view = "ativos",
}: ListPeopleParams = {}): Promise<{
  people: PersonListItem[];
  error: string | null;
}> {
  const supabase = await createClient();

  let query = supabase
    .from("people")
    .select(
      `id, full_name, email, phone, phone_country_code, lifecycle_stage,
       created_at, deleted_at,
       person_tags(tag:tags(id, name, color)),
       opportunities(count)`,
    )
    .order("created_at", { ascending: false })
    .limit(200);

  query =
    view === "excluidos"
      ? query.not("deleted_at", "is", null)
      : query.is("deleted_at", null);

  if (search?.trim()) {
    // Escapa vírgula e parênteses: o filtro `or` do PostgREST os usa como
    // separadores, então um nome com vírgula quebraria a consulta.
    const term = search.trim().replace(/[,()]/g, " ");
    query = query.or(
      `full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`,
    );
  }

  const { data, error } = await query;

  if (error) return { people: [], error: error.message };

  let people: PersonListItem[] = (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      full_name: string;
      email: string | null;
      phone: string | null;
      phone_country_code: string | null;
      lifecycle_stage: PersonListItem["lifecycle_stage"];
      created_at: string;
      deleted_at: string | null;
      person_tags: { tag: PersonTag | null }[] | null;
      opportunities: { count: number }[] | null;
    };

    return {
      id: r.id,
      full_name: r.full_name,
      email: r.email,
      phone: r.phone,
      phone_country_code: r.phone_country_code,
      lifecycle_stage: r.lifecycle_stage,
      created_at: r.created_at,
      deleted_at: r.deleted_at,
      tags: (r.person_tags ?? []).map((t) => t.tag).filter((t): t is PersonTag => !!t),
      opportunity_count: r.opportunities?.[0]?.count ?? 0,
    };
  });

  // Filtro por tag é aplicado aqui porque o PostgREST não filtra por tabela
  // aninhada sem descartar o resto do join. Com o volume atual (centenas de
  // contatos) isso é irrelevante; se crescer, vira uma view no banco.
  if (tagIds?.length) {
    const wanted = new Set(tagIds);
    people = people.filter((p) => p.tags.some((t) => wanted.has(t.id)));
  }

  return { people, error: null };
}

export async function listTags(): Promise<{
  tags: PersonTag[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .select("id, name, color")
    .order("name");

  // Sem o canal de erro, tag sumia da tela e parecia que ninguém marcou nada.
  if (error) return { tags: [], error: error.message };

  return { tags: (data as PersonTag[] | null) ?? [], error: null };
}
