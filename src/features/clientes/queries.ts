import { createClient } from "@/lib/supabase/server";

import { POR_PAGINA } from "@/lib/paginacao";
import { parceirosVisiveis, type ParceiroDoContato } from "@/lib/parceiros";

export type ClienteDaLista = {
  id: string;
  full_name: string;
  email: string | null;
  phone_country_code: string | null;
  phone: string | null;
  client_since: string | null;
  /** Nome do dono, ou o e-mail dele; nulo sem dono ou quando não se enxerga. */
  dono: string | null;
  /** O parceiro que trouxe o cliente (PAR-6); o contato que aparece é o dele. */
  partner_organization_id: string | null;
  parceiro: ParceiroDoContato | null;
};

/**
 * Uma página da lista de Clientes, com o total do filtro.
 *
 * A busca é `buscar_clientes` (0049), sob a RLS de quem chama — nada aqui
 * filtra por organização. O nome do dono vem de `profiles` numa segunda
 * consulta: a chave do dono aponta para `organization_members`, e o PostgREST
 * não embute `profiles` por ela. Dono que a RLS de `profiles` não mostra
 * (membro de organização alheia, num cliente atribuído) fica sem nome.
 *
 * Os tipos gerados dão `owner_id` e `client_since` como não nulos — o gerador
 * perde a nulidade em função que devolve tabela —, mas podem vir nulos.
 */
export async function listarClientes({
  busca,
  pagina,
}: {
  busca?: string;
  pagina: number;
}): Promise<{ clientes: ClienteDaLista[]; total: number; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("buscar_clientes", {
    p_busca: busca?.trim() ?? "",
    p_limite: POR_PAGINA,
    p_deslocamento: (pagina - 1) * POR_PAGINA,
  });
  if (error) return { clientes: [], total: 0, error: error.message };

  const linhas = data ?? [];
  const donos = [
    ...new Set(linhas.map((l): string | null => l.owner_id).filter((id) => id !== null)),
  ];

  const nomes = new Map<string, string>();
  if (donos.length > 0) {
    const perfis = await supabase.from("profiles").select("id, full_name, email").in("id", donos);
    if (perfis.error) return { clientes: [], total: 0, error: perfis.error.message };
    for (const p of perfis.data ?? []) nomes.set(p.id, p.full_name || p.email);
  }

  return {
    clientes: linhas.map((l) => {
      const dono: string | null = l.owner_id;
      // O gerador dá as colunas do parceiro como não nulas; no cliente direto
      // elas vêm nulas (left join).
      const parceiro: string | null = l.partner_organization_id ?? null;
      return {
        id: l.id,
        full_name: l.full_name,
        email: l.email,
        phone_country_code: l.phone_country_code,
        phone: l.phone,
        client_since: l.client_since,
        dono: dono === null ? null : (nomes.get(dono) ?? null),
        partner_organization_id: parceiro,
        parceiro:
          parceiro === null
            ? null
            : {
                name: l.parceiro_nome,
                email: l.parceiro_email,
                phone_country_code: l.parceiro_ddi,
                phone: l.parceiro_telefone,
              },
      };
    }),
    total: Number(linhas[0]?.total ?? 0),
    error: null,
  };
}

/**
 * Os parceiros que o Novo cliente oferece (PAR-5), da organização atual: só
 * `partner`, nunca ela mesma, e teste só com teste (`parceirosVisiveis`).
 * Membro da Duli lê todas as organizações (0003); a RLS decide o resto.
 */
export async function listarParceirosParaNovoCliente(
  organizacaoAtual: string | null,
): Promise<{ parceiros: { id: string; nome: string }[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("organizations").select("id, name, type, is_test");
  if (error) return { parceiros: [], error: error.message };

  return {
    parceiros: parceirosVisiveis(data ?? [], organizacaoAtual).map((o) => ({ id: o.id, nome: o.name })),
    error: null,
  };
}
