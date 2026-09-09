import { traduzirErro } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";

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

export type PapelNaOrganizacao = "owner" | "admin" | "staff";

type Associacao = {
  organization_id: string;
  role: PapelNaOrganizacao;
  created_at: string;
  organizations: { type: "root" | "partner" } | null;
};

/**
 * A regra de desempate, explícita e com motivo.
 *
 * A raiz manda: quem trabalha na Duli e também foi convidado por um parceiro
 * opera pela Duli — o contrário gravaria a operação da casa dentro do
 * parceiro. Sem raiz, a associação mais antiga, que é a organização de origem
 * da pessoa.
 *
 * Pura e sem efeito na lista recebida: a mesma lista alimenta o seletor de
 * organização na tela.
 */
export function escolherOrganizacao<
  T extends { created_at: string; organizations: { type: string } | null },
>(associacoes: T[]): T | null {
  if (associacoes.length === 0) return null;

  const raiz = associacoes.filter((a) => a.organizations?.type === "root");
  const candidatas = raiz.length > 0 ? raiz : associacoes;

  return [...candidatas].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  )[0];
}

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
      error: traduzirErro(error),
    };
  }

  const escolhida = escolherOrganizacao(
    (data ?? []) as unknown as Associacao[],
  );

  return {
    supabase,
    userId: user.id,
    organizationId: escolhida?.organization_id ?? null,
    papel: escolhida?.role ?? null,
    error: null as string | null,
  };
}

/** A frase única para quem chegou sem organização. */
export const SEM_ORGANIZACAO =
  "Sua conta não está vinculada a nenhuma organização.";
