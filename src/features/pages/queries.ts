import { createClient } from "@/lib/supabase/server";

/**
 * Leituras das Observações. A separação por organização é da RLS (0024).
 */

export type PaginaDoProcesso = {
  id: string;
  updated_at: string;
  autor: string | null;
  /** Se já foi escrita alguma vez — uma página recém-criada nunca foi. */
  editada: boolean;
};

const COLUNAS =
  "id, created_at, updated_at, autor:profiles!project_pages_updated_by_fkey(full_name, email)";

/**
 * A página de observações do processo, criada na primeira vez que alguém abre.
 *
 * Criar sob demanda e não junto com o processo: processo antigo, vindo da
 * migração, também ganha a aba. Duas pessoas abrindo ao mesmo tempo esbarram
 * no `unique(project_id, kind)` — a segunda relê a que a primeira criou.
 */
export async function paginaDoProcesso(
  projectId: string,
  organizationId: string,
): Promise<{ pagina: PaginaDoProcesso | null; error: string | null }> {
  const supabase = await createClient();

  const ler = () =>
    supabase
      .from("project_pages")
      .select(COLUNAS)
      .eq("project_id", projectId)
      .eq("kind", "notes")
      .maybeSingle();

  let { data, error } = await ler();
  if (error) return { pagina: null, error: error.message };

  if (!data) {
    const criada = await supabase
      .from("project_pages")
      .insert({ organization_id: organizationId, project_id: projectId, kind: "notes" })
      .select(COLUNAS)
      .single();

    if (criada.error?.code === "23505") ({ data, error } = await ler());
    else ({ data, error } = criada);
    if (error) return { pagina: null, error: error.message };
    if (!data) return { pagina: null, error: "Página não encontrada." };
  }

  return {
    pagina: {
      id: data.id,
      updated_at: data.updated_at,
      autor: data.autor?.full_name ?? data.autor?.email ?? null,
      editada: data.updated_at !== data.created_at,
    },
    error: null,
  };
}

/** Quem pode ser @mencionado: a equipe da organização do processo. */
export async function equipeDaOrganizacao(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("user_id, perfil:profiles!organization_members_user_id_fkey(full_name, email)")
    .eq("organization_id", organizationId);

  return {
    equipe: (data ?? []).map((m) => ({
      id: m.user_id,
      nome: m.perfil?.full_name || m.perfil?.email || "Sem nome",
    })),
    error: error?.message ?? null,
  };
}
