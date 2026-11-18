"use server";

import { revalidatePath } from "next/cache";

import { falhou, gravou, type ActionState } from "@/lib/action-state";
import { traduzirErro } from "@/lib/erros";
import { resultado } from "@/lib/gravar";
import { novoId } from "@/lib/id";
import { contextoAtual, SEM_ORGANIZACAO } from "@/lib/organizacao";
import {
  buscarParecidos,
  CAMPO_CONFIRMAR_PARECIDO,
  contatoMudou,
  type EstadoComConfirmacao,
} from "@/lib/parecidos";
import { createClient } from "@/lib/supabase/server";
import { personFromForm } from "./schema";

/**
 * Cria um contato.
 *
 * Nasce como `contact`. Ele vira `opportunity` quando ganha a primeira
 * oportunidade e `client` quando uma é ganha — sem cópia entre tabelas,
 * porque contato, lead e cliente são a mesma linha.
 *
 * Antes de gravar, procura quem já tem o mesmo e-mail ou telefone (CON-8).
 * Achando, **não grava**: devolve os parecidos, e a tela pergunta "É a mesma
 * pessoa?". Só o reenvio com `CAMPO_CONFIRMAR_PARECIDO` grava assim mesmo.
 */
export async function createPerson(
  _prev: EstadoComConfirmacao,
  formData: FormData,
): Promise<EstadoComConfirmacao> {
  const parsed = personFromForm(formData);
  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  const { supabase, userId, organizationId, error: erroDoContexto } =
    await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);
  if (!organizationId) return falhou(SEM_ORGANIZACAO);

  if (formData.get(CAMPO_CONFIRMAR_PARECIDO) !== "1") {
    const busca = await buscarParecidos(supabase, {
      email: parsed.data.email,
      ddi: parsed.data.phone_country_code,
      telefone: parsed.data.phone,
    });
    if (busca.error) return falhou(busca.error);
    if (busca.parecidos.length > 0) {
      return { error: null, parecidos: busca.parecidos, token: novoId() };
    }
  }

  const { error } = await supabase.from("people").insert({
    ...parsed.data,
    organization_id: organizationId,
    lifecycle_stage: "contact",
    created_by: userId,
  });

  if (error) return falhou(traduzirErro(error));

  revalidatePath("/contatos");
  return gravou();
}

/**
 * Edita um contato.
 *
 * Só procura parecidos quando o e-mail, o DDI ou o telefone **mudaram** —
 * comparados normalizados, para redigitar a máscara não perguntar nada — e
 * nunca avisa sobre o próprio contato (`ignorar`).
 */
export async function updatePerson(
  _prev: EstadoComConfirmacao,
  formData: FormData,
): Promise<EstadoComConfirmacao> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return falhou("Contato não informado.");

  const parsed = personFromForm(formData);
  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  const supabase = await createClient();

  if (formData.get(CAMPO_CONFIRMAR_PARECIDO) !== "1") {
    const { data: atual, error: erroAtual } = await supabase
      .from("people")
      .select("email, phone_country_code, phone")
      .eq("id", id)
      .maybeSingle();
    if (erroAtual) return falhou(traduzirErro(erroAtual));
    if (!atual) return falhou("Contato não encontrado.");

    const novo = {
      email: parsed.data.email,
      ddi: parsed.data.phone_country_code,
      telefone: parsed.data.phone,
    };
    const antes = { email: atual.email, ddi: atual.phone_country_code, telefone: atual.phone };

    if (contatoMudou(antes, novo)) {
      const busca = await buscarParecidos(supabase, { ...novo, ignorar: id });
      if (busca.error) return falhou(busca.error);
      if (busca.parecidos.length > 0) {
        return { error: null, parecidos: busca.parecidos, token: novoId() };
      }
    }
  }

  const { error } = await supabase.from("people").update(parsed.data).eq("id", id);

  if (error) return falhou(traduzirErro(error));

  revalidatePath("/contatos");
  // A tela do lead (`/crm/[id]`) mostra o mesmo dado.
  revalidatePath("/crm/[id]", "page");
  return gravou();
}

/**
 * Exclusão reversível: marca `deleted_at` e some da lista de ativos.
 *
 * Contato tem histórico pendurado — notas, arquivos, oportunidades. Apagar de
 * verdade levaria tudo junto, e quase sempre a intenção é só tirar da vista.
 */
export async function softDeletePerson(
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return falhou("Contato não informado.");

  const supabase = await createClient();
  const estado = resultado(
    await supabase
      .from("people")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .select("id"),
  );
  if (estado.error) return estado;

  revalidatePath("/contatos");
  return estado;
}

export async function restorePerson(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return falhou("Contato não informado.");

  const supabase = await createClient();
  const estado = resultado(
    await supabase
      .from("people")
      .update({ deleted_at: null })
      .eq("id", id)
      .select("id"),
  );
  if (estado.error) return estado;

  revalidatePath("/contatos");
  return estado;
}
