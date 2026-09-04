import { createClient } from "@/lib/supabase/server";

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  type: "root" | "partner";
  role: "owner" | "admin" | "staff";
};

export type UserContext = {
  userId: string;
  email: string;
  fullName: string | null;
  organizations: OrganizationSummary[];
  /** Membro da organização raiz = equipe Duli. */
  isRoot: boolean;
  /** Preenchido quando o schema ainda não existe ou a leitura falhou. */
  error: string | null;
};

/**
 * Contexto do usuário logado: quem é e em quais organizações atua.
 *
 * Base de toda decisão de permissão na interface. A RLS é quem realmente
 * protege os dados — isto aqui só evita mostrar o que não faz sentido.
 */
export async function getUserContext(): Promise<UserContext | null> {
  const supabase = await createClient();

  // Envolvido porque `getUser` fala com a rede: uma queda aqui estourava no
  // layout, e exceção em layout escapa da fronteira de erro do próprio grupo
  // de rotas — o app inteiro sumia por causa de um piscar do servidor de
  // autenticação. Agora vira campo `error`, e a casca continua de pé.
  let user = null;
  let authError: string | null = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    user = data.user;
    authError = error?.message ?? null;
  } catch (e) {
    authError = e instanceof Error ? e.message : "Falha ao verificar a sessão.";
  }

  if (authError) {
    return {
      userId: "",
      email: "",
      fullName: null,
      organizations: [],
      isRoot: false,
      error: authError,
    };
  }

  if (!user) return null;

  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organizations(id, name, slug, type)")
    .eq("user_id", user.id);

  if (error) {
    return {
      userId: user.id,
      email: user.email ?? "",
      fullName: null,
      organizations: [],
      isRoot: false,
      error: error.message,
    };
  }

  const organizations: OrganizationSummary[] = (data ?? [])
    .filter((row) => row.organizations)
    .map((row) => {
      const org = row.organizations as unknown as {
        id: string;
        name: string;
        slug: string;
        type: "root" | "partner";
      };
      return { ...org, role: row.role as OrganizationSummary["role"] };
    });

  return {
    userId: user.id,
    email: user.email ?? "",
    fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
    organizations,
    isRoot: organizations.some((o) => o.type === "root"),
    error: null,
  };
}
