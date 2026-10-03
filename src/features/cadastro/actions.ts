"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { falhou, type ActionState } from "@/lib/action-state";
import { traduzirErro } from "@/lib/erros";
import { resultado } from "@/lib/gravar";
import { contextoAtual } from "@/lib/organizacao";
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
 */
export async function salvarCadastro(
  personId: string,
  formData: FormData,
): Promise<EstadoDaFicha> {
  // A equipe completa aos poucos: só o nome é obrigatório.
  const ficha = fichaDoFormulario(formData, "parcial");
  if (!ficha.ok) return { error: ficha.erro, campos: ficha.campos };

  const supabase = await createClient();
  const { error } = await supabase.rpc("salvar_cadastro", {
    p_person: personId,
    p_dados: ficha.dados,
  });
  if (error) return { error: traduzirErro(error) };

  revalidatePath(`/contatos/${personId}`);
  // Nome, e-mail e telefone aparecem na lista.
  revalidatePath("/contatos");
  // A tela do lead (`/crm/[id]`) mostra o mesmo dado.
  revalidatePath("/crm/[id]", "page");
  return { error: null };
}

/** Onde a ficha e o estado dela aparecem: o contato, o CRM e a Início. */
function revalidar(personId: string) {
  revalidatePath(`/contatos/${personId}`);
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

  const cancelado = await supabase
    .from("registration_forms")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("person_id", personId)
    .is("submitted_at", null)
    .is("cancelled_at", null);
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

/** Mata o link que ainda não foi usado. Ficha já enviada não se cancela. */
export async function cancelarLink(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return falhou("Link não informado.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("registration_forms")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .is("submitted_at", null)
    .select("person_id");
  const estado = resultado({ data, error });
  if (estado.error) return estado;

  revalidar(data![0].person_id);
  return estado;
}

/** "Conferi": a ficha recebida sai dos avisos da tela Início. */
export async function marcarConferida(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return falhou("Ficha não informada.");

  const { supabase, userId, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data, error } = await supabase
    .from("registration_forms")
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: userId })
    .eq("id", id)
    .not("submitted_at", "is", null)
    .select("person_id");
  const estado = resultado({ data, error });
  if (estado.error) return estado;

  revalidar(data![0].person_id);
  return estado;
}
