"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { falhou, type ActionState } from "@/lib/action-state";
import { traduzirErro } from "@/lib/erros";
import { contextoAtual } from "@/lib/organizacao";

import { processoFromForm } from "./schema";

/**
 * Cria o processo a partir do tipo de visto e leva direto para ele.
 *
 * A cópia das etapas e das pastas é toda do banco (`criar_processo`, numa
 * transação só): aqui só se valida o formulário e se chama a função. A
 * organização também vem de lá — da pessoa, não de quem clicou.
 */
export async function criarProcesso(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = processoFromForm(formData);
  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  const { supabase, error: erroDoContexto } = await contextoAtual();
  if (erroDoContexto) return falhou(erroDoContexto);

  const { person_id, visa_type_id, title, opportunity_id } = parsed.data;

  const { data: id, error } = await supabase.rpc("criar_processo", {
    p_person: person_id,
    p_visa_type: visa_type_id,
    p_title: title,
    ...(opportunity_id ? { p_opportunity: opportunity_id } : {}),
  });

  if (error) return falhou(traduzirErro(error));
  if (!id) return falhou("O processo não foi criado. Tente de novo.");

  revalidatePath("/projetos");
  revalidatePath(`/contatos/${person_id}`);
  revalidatePath("/crm");

  // Fora de try/catch: `redirect` funciona lançando, e capturá-lo engoliria
  // a navegação.
  redirect(`/projetos/${id}`);
}
