"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { revalidarPessoa } from "@/lib/revalidar";

import { falhou, type ActionState } from "@/lib/action-state";
import { traduzirErro } from "@/lib/erros";
import { resultado } from "@/lib/gravar";
import { contextoAtual } from "@/lib/organizacao";
import { buscarParecidos, CAMPO_CONFIRMAR_PARECIDO, contatoMudou } from "@/lib/parecidos";
import { createClient } from "@/lib/supabase/server";

import type { EstadoDaFicha } from "./estado";
import { validadeDoLink } from "./regras";
import { fichaDoFormulario } from "./schema";

/**
 * A porta da equipe para a ficha de cadastro.
 *
 * Grava por `salvar_cadastro` (0035), o mesmo caminho que a ficha do lead
 * usa — a lista de campos e as regras moram lá, e as duas portas não têm como
 * divergir. A função é `security invoker`: quem decide se esta pessoa pode
 * ser editada por quem está logado é a RLS, não este arquivo.
 *
 * Trocou o e-mail, o DDI ou o telefone para um que já existe em outro
 * contato? Não grava: devolve os parecidos (CON-4), como a edição de
 * contato. Só o reenvio com `CAMPO_CONFIRMAR_PARECIDO` grava assim mesmo.
 */
export async function salvarCadastro(
  personId: string,
  formData: FormData,
): Promise<EstadoDaFicha> {
  const supabase = await createClient();

  // Quem decide se a ficha tem contato é a linha da pessoa, nunca o
  // formulário: o cliente de parceiro não tem contato próprio (PAR-7).
  const { data: atual, error: erroAtual } = await supabase
    .from("people")
    .select("email, phone_country_code, phone, partner_organization_id")
    .eq("id", personId)
    .maybeSingle();
  if (erroAtual) return { error: traduzirErro(erroAtual) };
  if (!atual) return { error: "Contato não encontrado." };
  const semContato = atual.partner_organization_id !== null && atual.partner_organization_id !== undefined;

  // A equipe completa aos poucos: nome, e-mail, DDI e telefone obrigatórios —
  // menos no cliente de parceiro, que fica só com o nome.
  const ficha = fichaDoFormulario(formData, "parcial", undefined, { semContato });
  if (!ficha.ok) return { error: ficha.erro, campos: ficha.campos };

  if (!semContato && formData.get(CAMPO_CONFIRMAR_PARECIDO) !== "1") {
    const novo = {
      email: ficha.dados.email ?? null,
      ddi: ficha.dados.phone_country_code ?? null,
      telefone: ficha.dados.phone ?? null,
    };
    const antes = { email: atual.email, ddi: atual.phone_country_code, telefone: atual.phone };

    if (contatoMudou(antes, novo)) {
      const busca = await buscarParecidos(supabase, { ...novo, ignorar: personId });
      if (busca.error) return { error: busca.error };
      if (busca.parecidos.length > 0) return { error: null, parecidos: busca.parecidos };
    }
  }

  const { error } = await supabase.rpc("salvar_cadastro", {
    p_person: personId,
    p_dados: ficha.dados,
  });
  if (error) return { error: traduzirErro(error) };

  // Nome, e-mail e telefone aparecem nas listas e nos perfis.
  revalidarPessoa(personId);
  // A tela do lead (`/crm/[id]`) mostra o mesmo dado.
  revalidatePath("/crm/[id]", "page");
  return { error: null };
}

/** Onde a ficha e o estado dela aparecem: o contato, o CRM e a Início. */
function revalidar(personId: string) {
  revalidarPessoa(personId);
  revalidatePath("/crm");
  // A tela do lead mostra a ficha e o link.
  revalidatePath("/crm/[id]", "page");
  revalidatePath("/");
}

/**
 * Gera o link da ficha para o lead preencher.
 *
 * Um link em aberto por pessoa: o que houver é cancelado antes — é o que faz
 * "gerar outro" matar o endereço que já foi enviado.
 *
 * A organização do link é a **da pessoa**, lida do banco, e não a de quem
 * clicou: carimbado com a organização errada, o link sairia válido e ninguém
 * da organização dona o enxergaria.
 */
export async function gerarLink(formData: FormData): Promise<ActionState> {
  const personId = formData.get("person_id");
  if (typeof personId !== "string" || !personId) return falhou("Contato não informado.");

  const { supabase, userId, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data: pessoa, error: erroPessoa } = await supabase
    .from("people")
    .select("id, organization_id")
    .eq("id", personId)
    .maybeSingle();
  if (erroPessoa) return falhou(traduzirErro(erroPessoa));
  if (!pessoa) return falhou("Contato não encontrado.");

  // Só a ficha comum aberta. O link com a forma se cancela no negócio: aberto,
  // o banco recusa o link novo com a frase e o título do negócio (P7).
  const cancelado = await supabase
    .from("registration_forms")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("person_id", personId)
    .is("closed_at", null)
    .is("cancelled_at", null)
    .is("payment_plan_id", null);
  if (cancelado.error) return falhou(traduzirErro(cancelado.error));

  const estado = resultado(
    await supabase
      .from("registration_forms")
      .insert({
        organization_id: pessoa.organization_id,
        person_id: personId,
        // 256 bits, gerados no servidor. É a única chave da porta pública.
        token: randomBytes(32).toString("base64url"),
        expires_at: validadeDoLink().toISOString(),
        created_by: userId,
      })
      .select("id"),
  );
  if (estado.error) return estado;

  revalidar(personId);
  return estado;
}

/**
 * Mata o link que ainda não foi usado. Ficha já enviada não se cancela, nem o
 * link com a forma: esse é do negócio (P8), e o banco recusaria.
 */
export async function cancelarLink(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return falhou("Link não informado.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("registration_forms")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .is("submitted_at", null)
    .is("payment_plan_id", null)
    .select("person_id");
  const estado = resultado({ data, error });
  if (estado.error) return estado;

  revalidar(data![0].person_id);
  return estado;
}

/**
 * "Conferi": a ficha recebida sai dos avisos da tela Início.
 *
 * Confere a escolhida e as que a pessoa mandou antes dela e ninguém conferiu
 * (revisão final da 4b): o cliente que manda os dados duas vezes antes do
 * Conferi — "pedir os dados de novo", ou um link novo para corrigir — deixava
 * a primeira sem conferir, e o aviso da Início preso, sem botão que o tirasse.
 * A mais recente é a que vale; as anteriores foram substituídas por ela.
 */
export async function marcarConferida(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return falhou("Ficha não informada.");

  const { supabase, userId, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data: escolhida, error: erroDaEscolhida } = await supabase
    .from("registration_forms")
    .select("person_id, submitted_at")
    .eq("id", id)
    .not("submitted_at", "is", null)
    .maybeSingle();
  if (erroDaEscolhida) return falhou(traduzirErro(erroDaEscolhida));
  if (!escolhida?.submitted_at) return falhou("Ficha não encontrada.");

  const { data, error } = await supabase
    .from("registration_forms")
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: userId })
    .eq("person_id", escolhida.person_id)
    .not("submitted_at", "is", null)
    .is("reviewed_at", null)
    .lte("submitted_at", escolhida.submitted_at)
    .select("person_id");
  const estado = resultado({ data, error });
  if (estado.error) return estado;

  revalidar(data![0].person_id);
  return estado;
}
