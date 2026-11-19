"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
import { hojeEmSaoPaulo } from "@/lib/formatar";
import { createClient } from "@/lib/supabase/server";
import { clienteFromForm, personFromForm, type PersonInput } from "./schema";

type Banco = Awaited<ReturnType<typeof createClient>>;

/**
 * E-mail ou telefone trocados para os de outro contato param a gravação com
 * a lista dos parecidos (CON-4). Nulo: pode gravar.
 */
async function parecidosNaTroca(
  supabase: Banco,
  id: string,
  antes: { email: string | null; phone_country_code: string | null; phone: string | null },
  dados: PersonInput,
): Promise<EstadoComConfirmacao | null> {
  const novo = { email: dados.email, ddi: dados.phone_country_code, telefone: dados.phone };
  const atual = { email: antes.email, ddi: antes.phone_country_code, telefone: antes.phone };
  if (!contatoMudou(atual, novo)) return null;

  const busca = await buscarParecidos(supabase, { ...novo, ignorar: id });
  if (busca.error) return falhou(busca.error);
  if (busca.parecidos.length > 0) return { error: null, parecidos: busca.parecidos, token: novoId() };
  return null;
}

/**
 * Cria um contato.
 *
 * Nasce como `contact`. Ele vira `opportunity` quando ganha a primeira
 * oportunidade e `client` quando uma é ganha — sem cópia entre tabelas,
 * porque contato, lead e cliente são a mesma linha.
 *
 * Antes de gravar, procura quem já tem o mesmo e-mail ou telefone (CON-4).
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

    const parar = await parecidosNaTroca(supabase, id, atual, parsed.data);
    if (parar) return parar;
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

/**
 * O Editar do cliente (CLI-10, CLI-12): os campos do contato, mais dono,
 * cliente desde e participantes. A conferência de parecidos é a mesma do
 * contato. Os participantes gravam só a diferença: entra quem é novo, sai
 * quem foi tirado — na organização **da pessoa**, nunca na de quem clicou.
 */
export async function atualizarCliente(
  _prev: EstadoComConfirmacao,
  formData: FormData,
): Promise<EstadoComConfirmacao> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return falhou("Cliente não informado.");

  const parsed = personFromForm(formData);
  if (!parsed.success) return falhou(parsed.error.issues[0].message);
  const cliente = clienteFromForm(formData, hojeEmSaoPaulo());
  if (!cliente.ok) return falhou(cliente.erro);

  const supabase = await createClient();
  const { data: atual, error: erroAtual } = await supabase
    .from("people")
    .select("organization_id, email, phone_country_code, phone")
    .eq("id", id)
    .maybeSingle();
  if (erroAtual) return falhou(traduzirErro(erroAtual));
  if (!atual) return falhou("Cliente não encontrado.");

  if (formData.get(CAMPO_CONFIRMAR_PARECIDO) !== "1") {
    const parar = await parecidosNaTroca(supabase, id, atual, parsed.data);
    if (parar) return parar;
  }

  const { error } = await supabase
    .from("people")
    .update({ ...parsed.data, owner_id: cliente.owner_id, client_since: cliente.client_since })
    .eq("id", id);
  if (error) return falhou(traduzirErro(error));

  const { data: antes, error: erroLista } = await supabase
    .from("person_participants")
    .select("user_id")
    .eq("person_id", id);
  if (erroLista) return falhou(traduzirErro(erroLista));

  const eram = new Set((antes ?? []).map((p) => p.user_id));
  const serao = new Set(cliente.participantes);
  const entram = [...serao].filter((u) => !eram.has(u));
  const saem = [...eram].filter((u) => !serao.has(u));

  if (entram.length > 0) {
    const { error: erroEntrada } = await supabase.from("person_participants").insert(
      entram.map((user_id) => ({ organization_id: atual.organization_id, person_id: id, user_id })),
    );
    if (erroEntrada) return falhou(traduzirErro(erroEntrada));
  }
  if (saem.length > 0) {
    const { error: erroSaida } = await supabase
      .from("person_participants")
      .delete()
      .eq("person_id", id)
      .in("user_id", saem);
    if (erroSaida) return falhou(traduzirErro(erroSaida));
  }

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
  return gravou();
}

/**
 * Torna cliente à mão (CLI-11), pela função do banco: só a gestão, com a
 * data (hoje, se vazia). Sem volta. Gravado, leva ao perfil de cliente.
 */
export async function marcarComoCliente(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return falhou("Contato não informado.");
  const desde = formData.get("desde");

  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_como_cliente", {
    p_pessoa: id,
    p_desde: typeof desde === "string" && desde ? desde : undefined,
  });
  if (error) return falhou(traduzirErro(error));

  revalidatePath("/clientes");
  revalidatePath("/contatos");
  redirect(`/clientes/${id}`);
}
