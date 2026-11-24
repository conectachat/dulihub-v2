"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { falhou } from "@/lib/action-state";
import { aparar, contatoNovoDoFormulario } from "@/lib/contato";
import { traduzirErro } from "@/lib/erros";
import { novoId } from "@/lib/id";
import { contextoAtual, SEM_ORGANIZACAO } from "@/lib/organizacao";
import {
  CAMPO_CONFIRMAR_PARECIDO,
  respostaDoNovoCliente,
  type EstadoComConfirmacao,
} from "@/lib/parecidos";
import { enderecoDoNovoCliente } from "@/lib/pessoa";
import { revalidarPessoa } from "@/lib/revalidar";

/**
 * O Novo cliente (CLI-15): o cliente antigo, que nunca passou pelo funil.
 *
 * Quem decide é o banco (`criar_cliente`, 0055): só a gestão, só a
 * organização atual, quem está no funil fica de fora, e o contato novo nasce
 * junto. A ação lê o formulário, manda a organização atual — o contato novo
 * não tem registro-pai — e leva ao perfil na aba Projetos, com o processo a
 * criar.
 */

/**
 * Uma linha da busca do diálogo. Declarada à mão: o gerador de tipos dá
 * e-mail, DDI e telefone como não nulos, e contato sem eles existe (0040).
 */
export type ContatoParaCliente = {
  id: string;
  full_name: string;
  email: string | null;
  phone_country_code: string | null;
  phone: string | null;
};

const LIMITE_DA_BUSCA = 20;

export async function criarCliente(
  _anterior: EstadoComConfirmacao,
  formData: FormData,
): Promise<EstadoComConfirmacao> {
  let contato:
    | { p_contato: string }
    | { p_novo_contato: Record<string, string | null> }
    | { p_parceiro: string; p_novo_contato: { full_name: string } };
  if (formData.get("modo_contato") === "parceiro") {
    // Novo cliente › Parceiro (PAR-5): só o nome; o contato é o do parceiro.
    const parceiro = formData.get("parceiro_id");
    if (!z.string().uuid().safeParse(parceiro).success) return falhou("Escolha o parceiro.");
    const nome = aparar(String(formData.get("nome_do_cliente") ?? ""));
    if (!nome) return falhou("Informe o nome do cliente.");
    contato = { p_parceiro: parceiro as string, p_novo_contato: { full_name: nome } };
  } else if (formData.get("modo_contato") === "novo") {
    const novo = contatoNovoDoFormulario(formData);
    if (!novo.ok) return falhou(novo.erro);
    contato = { p_novo_contato: novo.contato };
  } else {
    const id = formData.get("person_id");
    if (!z.string().uuid().safeParse(id).success) return falhou("Escolha um contato");
    contato = { p_contato: id as string };
  }

  const { supabase, organizationId, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);
  if (!organizationId) return falhou(SEM_ORGANIZACAO);

  const { data, error } = await supabase.rpc("criar_cliente", {
    p_organizacao: organizationId,
    ...contato,
    p_confirmar_contato_parecido: formData.get(CAMPO_CONFIRMAR_PARECIDO) === "1",
  });
  if (error) return falhou(traduzirErro(error));

  const resposta = respostaDoNovoCliente.safeParse(data);
  if (!resposta.success) return falhou("O servidor respondeu num formato inesperado.");

  if (resposta.data.situacao === "precisa_confirmar") {
    if ("homonimos" in resposta.data) {
      return {
        error: null,
        homonimos: resposta.data.homonimos,
        parceiro: resposta.data.parceiro,
        token: novoId(),
      };
    }
    return { error: null, parecidos: resposta.data.parecidos, token: novoId() };
  }

  const pessoa = resposta.data.pessoa;
  revalidarPessoa(pessoa);
  // O Início conta clientes.
  revalidatePath("/");
  redirect(enderecoDoNovoCliente(pessoa));
}

/** A busca do diálogo: até 20, com o total do filtro (nunca cortar em silêncio). */
export async function buscarContatosParaCliente(
  busca: string,
): Promise<{ linhas: ContatoParaCliente[]; total: number; error: string | null }> {
  const { supabase, organizationId, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return { linhas: [], total: 0, error: erroDoContexto };
  if (!organizationId) return { linhas: [], total: 0, error: SEM_ORGANIZACAO };

  const { data, error } = await supabase.rpc("buscar_contatos_para_cliente", {
    p_organizacao: organizationId,
    p_busca: busca,
    p_limite: LIMITE_DA_BUSCA,
  });
  if (error) return { linhas: [], total: 0, error: traduzirErro(error) };

  const linhas = data ?? [];
  return {
    linhas: linhas.map(
      (l): ContatoParaCliente => ({
        id: l.id,
        full_name: l.full_name,
        email: l.email,
        phone_country_code: l.phone_country_code,
        phone: l.phone,
      }),
    ),
    total: linhas.length > 0 ? Number(linhas[0]!.total) : 0,
    error: null,
  };
}
