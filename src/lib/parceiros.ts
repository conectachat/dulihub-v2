import type { Enums } from "@/lib/supabase/database.types";

/**
 * As regras do cliente de parceiro que valem nos dois lados: no servidor
 * (Clientes, Contatos, Novo cliente) e no aparelho (Configuração › Parceiros,
 * Financeiro). Por isso só importa tipos do banco — nunca `organizacao.ts`,
 * que puxa o cliente do servidor.
 *
 * Desenho de 24/nov, §5.3 e §5.7.
 */

/** O que o cliente de parceiro mostra no lugar do próprio contato. */
export type ParceiroDoContato = {
  name: string;
  email: string | null;
  phone_country_code: string | null;
  phone: string | null;
};

export type ContatoExibido = {
  email: string | null;
  ddi: string | null;
  telefone: string | null;
  /** O nome do parceiro, para o "via ‹nome›"; nulo no cliente direto. */
  via: string | null;
};

/**
 * O contato que se mostra: o da pessoa ou, no cliente de parceiro, o do
 * parceiro. O do parceiro **vence sempre**, mesmo que a linha da pessoa tenha
 * contato — ele não é copiado, é lido na hora, então editar o parceiro muda
 * todos os clientes dele.
 *
 * O vínculo ausente (`undefined`) vale o mesmo que nulo: as linhas de
 * `people` que já estavam no aparelho antes da 0070 não têm a chave.
 */
export function contatoExibido(
  pessoa: {
    email: string | null;
    phone_country_code: string | null;
    phone: string | null;
    partner_organization_id?: string | null;
  },
  parceiro: ParceiroDoContato | null | undefined,
): ContatoExibido {
  if (!pessoa.partner_organization_id) {
    return {
      email: pessoa.email,
      ddi: pessoa.phone_country_code,
      telefone: pessoa.phone,
      via: null,
    };
  }

  return {
    email: parceiro?.email ?? null,
    ddi: parceiro?.phone_country_code ?? null,
    telefone: parceiro?.phone ?? null,
    via: parceiro?.name ?? null,
  };
}

/**
 * Os parceiros que se oferecem e se listam: só organizações `partner`, nunca
 * a atual, e só as de teste quando a atual é de teste. Assim o Renato, na
 * Duli, nunca vê a `parceiro-teste`, e a conta de teste nunca vê a Thais.
 *
 * A marca de teste ausente vale como "não é teste": é o parceiro recém-
 * cadastrado, ainda na fila do aparelho (a linha sobe sem `is_test`, e pela
 * API só nasce parceiro real). Sem isso ele sumia da lista até voltar do
 * servidor — sem internet, nunca aparecia.
 */
export function parceirosVisiveis<
  T extends { id: string; name: string; type: string; is_test?: boolean | null },
>(orgs: T[], atualId: string | null): T[] {
  const deTeste = (o: T | undefined) => o?.is_test ?? false;
  const atualDeTeste = deTeste(orgs.find((o) => o.id === atualId));

  return orgs
    .filter((o) => o.type === "partner" && o.id !== atualId && deTeste(o) === atualDeTeste)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Só o dono da Duli cadastra parceiro (o banco exige: 0036 e 0068). */
export function ehDonoDaRaiz(
  papel: Enums<"member_role"> | null | undefined,
  tipo: Enums<"organization_type"> | null | undefined,
): boolean {
  return papel === "owner" && tipo === "root";
}
