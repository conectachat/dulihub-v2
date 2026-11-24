"use client";

import { escolherOrganizacao } from "@/lib/escolher-organizacao";
import type { Enums, Tables } from "@/lib/supabase/database.types";

import type { BancoLocal } from "./banco";

/**
 * De qual organização é a gravação feita neste aparelho.
 *
 * O que `contextoAtual()` responde no servidor, respondido do espelho — e pela
 * **mesma** função de desempate (`escolherOrganizacao`), para que offline e
 * online não escolham diferente. Errar aqui não dá erro nenhum: a linha nasce
 * válida, só que na organização errada, e a RLS não recusa nada porque a
 * pessoa enxerga as duas.
 *
 * Nulo quando o espelho ainda não baixou o vínculo. Quem chama recusa a
 * gravação com uma frase — ninguém grava no escuro.
 */
export async function organizacaoLocal(
  banco: BancoLocal,
  userId: string,
): Promise<string | null> {
  return (await vinculoLocal(banco, userId))?.organizationId ?? null;
}

/**
 * A associação escolhida, com o papel e o tipo da organização: o que a tela
 * offline precisa para decidir o que mostrar (só o dono da raiz vê os botões
 * de Configuração › Parceiros). Decide só o que aparece — quem decide a
 * gravação é a RLS, quando ela sobe.
 */
export async function vinculoLocal(
  banco: BancoLocal,
  userId: string,
): Promise<{
  organizationId: string;
  papel: Enums<"member_role">;
  tipo: Enums<"organization_type"> | null;
} | null> {
  const [vinculos, orgs] = await Promise.all([
    banco.tabela("organization_members").toArray() as unknown as Promise<
      Tables<"organization_members">[]
    >,
    banco.tabela("organizations").toArray() as unknown as Promise<
      Tables<"organizations">[]
    >,
  ]);

  const tipo = new Map(orgs.map((o) => [o.id, o.type]));

  // O espelho de um membro da raiz traz vínculo de gente de outras
  // organizações (a policy deixa a raiz ler todos). Filtrar por usuário não é
  // zelo: é o mesmo defeito que `contextoAtual()` documenta.
  const meus = vinculos
    .filter((v) => v.user_id === userId)
    .map((v) => ({
      ...v,
      organizations: tipo.has(v.organization_id)
        ? { type: tipo.get(v.organization_id)! }
        : null,
    }));

  const escolhida = escolherOrganizacao(meus);
  if (!escolhida) return null;
  return {
    organizationId: escolhida.organization_id,
    papel: escolhida.role,
    tipo: escolhida.organizations?.type ?? null,
  };
}
