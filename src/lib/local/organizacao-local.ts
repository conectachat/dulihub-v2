"use client";

import { escolherOrganizacao } from "@/lib/escolher-organizacao";
import type { Tables } from "@/lib/supabase/database.types";

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

  return escolherOrganizacao(meus)?.organization_id ?? null;
}
