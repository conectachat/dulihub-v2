"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { falhou, type ActionState } from "@/lib/action-state";
import { traduzirErro } from "@/lib/erros";
import { resultado } from "@/lib/gravar";
import { contextoAtual } from "@/lib/organizacao";

import { itemFromForm } from "./schema";

/**
 * Os vistos do negócio, na tela do lead (CRM-13).
 *
 * Antes do Ganho, qualquer membro da equipe acrescenta, edita e remove; depois
 * dele, o banco recusa (0051) e a frase volta como erro. A organização vem do
 * negócio e o nome do visto — lidos aqui, nunca do formulário.
 */

const uuid = z.string().uuid();

function revalidar(negocioId: string) {
  revalidatePath(`/crm/${negocioId}`);
  revalidatePath("/crm");
}

function primeiroErro(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? "Confira os campos.";
}

export async function adicionarItem(
  _anterior: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const negocioId = formData.get("opportunity_id");
  const vistoId = formData.get("visa_type_id");
  if (!uuid.safeParse(negocioId).success) return falhou("Negócio não informado.");
  if (!uuid.safeParse(vistoId).success) return falhou("Escolha um visto.");

  const campos = itemFromForm(formData);
  if (!campos.success) return falhou(primeiroErro(campos.error));

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { data: negocio, error: erroNegocio } = await supabase
    .from("opportunities")
    .select("organization_id")
    .eq("id", negocioId as string)
    .maybeSingle();
  if (erroNegocio) return falhou(traduzirErro(erroNegocio));
  if (!negocio) return falhou("Negócio não encontrado.");

  const { data: visto, error: erroVisto } = await supabase
    .from("visa_types")
    .select("name, organization_id, is_active")
    .eq("id", vistoId as string)
    .maybeSingle();
  if (erroVisto) return falhou(traduzirErro(erroVisto));
  // A chave composta recusaria a outra organização; aqui a frase é melhor. O
  // visto desativado sai do seletor, e um formulário forjado não o põe de volta.
  if (!visto || visto.organization_id !== negocio.organization_id || !visto.is_active) {
    return falhou("Visto não encontrado.");
  }

  const { data: ultimo, error: erroUltimo } = await supabase
    .from("opportunity_items")
    .select("position")
    .eq("opportunity_id", negocioId as string)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroUltimo) return falhou(traduzirErro(erroUltimo));

  const estado = resultado(
    await supabase
      .from("opportunity_items")
      .insert({
        organization_id: negocio.organization_id,
        opportunity_id: negocioId as string,
        visa_type_id: vistoId as string,
        visa_name: visto.name,
        amount: campos.data.amount!,
        currency: campos.data.currency,
        position: (ultimo?.position ?? -1) + 1,
      })
      .select("id"),
  );
  if (estado.error) return estado;

  revalidar(negocioId as string);
  return estado;
}

export async function editarItem(
  _anterior: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (!uuid.safeParse(id).success) return falhou("Visto não informado.");

  const campos = itemFromForm(formData);
  if (!campos.success) return falhou(primeiroErro(campos.error));

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const resposta = await supabase
    .from("opportunity_items")
    .update({ amount: campos.data.amount!, currency: campos.data.currency })
    .eq("id", id as string)
    .select("opportunity_id");
  const estado = resultado(resposta);
  if (estado.error) return estado;

  revalidar(resposta.data![0]!.opportunity_id);
  return estado;
}

export async function removerItem(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (!uuid.safeParse(id).success) return falhou("Visto não informado.");

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  // Visto que já virou processo não sai do negócio: remover e acrescentar de
  // novo criaria um segundo processo no próximo Ganho — e processo não se
  // apaga. Desistir é encerrar o processo. (A 0054 recusa também no banco.)
  const { data: processos, error: erroProcessos } = await supabase
    .from("projects")
    .select("id")
    .eq("opportunity_item_id", id as string)
    .limit(1);
  if (erroProcessos) return falhou(traduzirErro(erroProcessos));
  if ((processos ?? []).length > 0) {
    return falhou("Este visto já tem processo: para desistir, encerre o processo.");
  }

  const resposta = await supabase
    .from("opportunity_items")
    .delete()
    .eq("id", id as string)
    .select("opportunity_id");
  const estado = resultado(resposta);
  if (estado.error) return estado;

  revalidar(resposta.data![0]!.opportunity_id);
  return estado;
}
