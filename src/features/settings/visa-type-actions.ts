"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { falhou, gravou, type ActionState } from "@/lib/action-state";
import { traduzirErro } from "@/lib/erros";
import { resultado, resultadoSemContagem } from "@/lib/gravar";
import { parseMoney, parseWholeNumber } from "@/lib/numbers";
import { createClient } from "@/lib/supabase/server";

/** @deprecated Use `ActionState` de `@/lib/action-state`. */
export type VisaState = ActionState;

const PATH = "/configuracoes/tipos-de-visto";

const visaSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(120),
  description: z.string().trim().optional(),
  base_price: z.string().nullish().transform(parseMoney),
  currency: z.enum(["BRL", "USD"]).default("BRL"),
  estimated_days: z
    .string()
    .trim()
    .optional()
    .transform(parseWholeNumber),
});

async function organizationId() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .limit(1)
    .maybeSingle();
  return data?.organization_id ?? null;
}

// ---------------------------------------------------------------- tipo de visto

export async function saveVisaType(
  _prev: VisaState,
  formData: FormData,
): Promise<VisaState> {
  const parsed = visaSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    base_price: formData.get("base_price"),
    currency: formData.get("currency") ?? "BRL",
    estimated_days: formData.get("estimated_days"),
  });
  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  const supabase = await createClient();
  const id = formData.get("id");
  const isActive = formData.get("is_active") === "on";

  if (typeof id === "string" && id) {
    const { error } = await supabase
      .from("visa_types")
      .update({ ...parsed.data, is_active: isActive })
      .eq("id", id);
    if (error) return falhou(traduzirErro(error));
  } else {
    const orgId = await organizationId();
    if (!orgId) return falhou("Sua conta não está vinculada a nenhuma organização.");

    const { error } = await supabase
      .from("visa_types")
      .insert({ ...parsed.data, is_active: isActive, organization_id: orgId });
    if (error) return falhou(traduzirErro(error));
  }

  revalidatePath(PATH);
  return gravou();
}

export async function deleteVisaType(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Tipo de visto não informado.");

  const supabase = await createClient();
  const estado = resultado(
    await supabase.from("visa_types").delete().eq("id", id).select("id"),
  );
  if (estado.error) return estado;

  revalidatePath(PATH);
  return estado;
}

// ------------------------------------------------------------- etapas do molde

const stageSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da etapa").max(120),
  estimated_days: z
    .string()
    .trim()
    .optional()
    .transform(parseWholeNumber),
});

export async function createVisaStage(
  _prev: VisaState,
  formData: FormData,
): Promise<VisaState> {
  const parsed = stageSchema.safeParse({
    name: formData.get("name"),
    estimated_days: formData.get("estimated_days"),
  });
  if (!parsed.success) return falhou(parsed.error.issues[0].message);

  const visaTypeId = formData.get("visa_type_id");
  if (typeof visaTypeId !== "string") return { error: "Tipo de visto não informado." };

  const rawParent = formData.get("parent_id");
  const parentId = typeof rawParent === "string" && rawParent ? rawParent : null;

  const supabase = await createClient();

  let query = supabase
    .from("visa_stages")
    .select("position")
    .eq("visa_type_id", visaTypeId)
    .order("position", { ascending: false })
    .limit(1);

  query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);

  const { data: siblings } = await query;

  const { error } = await supabase.from("visa_stages").insert({
    visa_type_id: visaTypeId,
    parent_id: parentId,
    name: parsed.data.name,
    estimated_days: parsed.data.estimated_days,
    position: (siblings?.[0]?.position ?? -1) + 1,
  });

  if (error) return falhou(traduzirErro(error));

  revalidatePath(PATH);
  return gravou();
}

export async function updateVisaStage(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Etapa não informada.");

  const patch: Record<string, unknown> = {};

  const name = formData.get("name");
  if (typeof name === "string" && name.trim()) patch.name = name.trim();

  if (formData.has("is_required")) {
    patch.is_required = formData.get("is_required") === "true";
  }

  if (formData.has("estimated_days")) {
    const raw = formData.get("estimated_days");
    patch.estimated_days =
      typeof raw === "string" ? parseWholeNumber(raw) : null;
  }

  // Nada a mudar não é falha; a tela só não precisa fazer nada.
  if (Object.keys(patch).length === 0) return gravou();

  const supabase = await createClient();
  const estado = resultado(
    await supabase.from("visa_stages").update(patch).eq("id", id).select("id"),
  );
  if (estado.error) return estado;

  revalidatePath(PATH);
  return estado;
}

export async function moveVisaStage(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const direction = formData.get("direction");
  if (typeof id !== "string" || (direction !== "up" && direction !== "down")) {
    return falhou("Movimento não informado.");
  }

  const supabase = await createClient();

  const { data: node, error: nodeError } = await supabase
    .from("visa_stages")
    .select("id, visa_type_id, parent_id, position")
    .eq("id", id)
    .maybeSingle();

  if (nodeError) return falhou(traduzirErro(nodeError));
  if (!node) return falhou("Etapa não encontrada.");

  let query = supabase
    .from("visa_stages")
    .select("id, position")
    .eq("visa_type_id", node.visa_type_id)
    .order("position", { ascending: direction === "down" })
    .limit(1);

  query = node.parent_id
    ? query.eq("parent_id", node.parent_id)
    : query.is("parent_id", null);

  const { data: neighbour, error: neighbourError } = await query[
    direction === "down" ? "gt" : "lt"
  ]("position", node.position).maybeSingle();

  if (neighbourError) return falhou(traduzirErro(neighbourError));
  // Já está na ponta. Não é erro, e a tela já desabilita o botão.
  if (!neighbour) return gravou();

  // Pela RPC da 0014. As duas gravações soltas que estavam aqui não tinham
  // transação nem posição sentinela: falhar entre elas deixava dois irmãos com
  // a mesma posição, e a busca de vizinho usa comparação estrita — a seta
  // parava de encontrar quem estava empatado.
  const estado = resultadoSemContagem(
    await supabase.rpc("swap_positions", {
      p_tabela: "visa_stages",
      p_a: node.id,
      p_b: neighbour.id,
    }),
  );
  if (estado.error) return estado;

  revalidatePath(PATH);
  return estado;
}

export async function deleteVisaStage(formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Etapa não informada.");

  const supabase = await createClient();
  const estado = resultado(
    await supabase.from("visa_stages").delete().eq("id", id).select("id"),
  );
  if (estado.error) return estado;

  revalidatePath(PATH);
  return estado;
}

// ------------------------------------------------- documentos exigidos do visto

/**
 * Marca ou desmarca um nó do catálogo para este tipo de visto.
 *
 * Marcar um grupo alcança os descendentes, mas a gravação é nó a nó. Guardar
 * só o grupo faria com que acrescentar um documento ao catálogo depois mudasse,
 * calado, o que este visto já exigia — e a decisão foi que nada muda sozinho.
 */
export async function toggleVisaDocument(
  formData: FormData,
): Promise<ActionState> {
  const visaTypeId = formData.get("visa_type_id");
  const documentTypeId = formData.get("document_type_id");
  const selected = formData.get("selected") === "true";

  if (typeof visaTypeId !== "string" || typeof documentTypeId !== "string") {
    return falhou("Pasta ou tipo de visto não informado.");
  }

  const supabase = await createClient();

  // Descobre o nó e todos abaixo dele.
  //
  // O erro aqui importa mais do que parece: com a leitura falhando, `children`
  // ficava vazio, a subárvore encolhia para um nó só, e a pessoa via metade da
  // seleção acontecer sem nenhum aviso.
  const { data: all, error: catalogoError } = await supabase
    .from("document_types")
    .select("id, parent_id");

  if (catalogoError) return falhou(traduzirErro(catalogoError));

  const children = new Map<string | null, string[]>();
  for (const row of all ?? []) {
    const list = children.get(row.parent_id) ?? [];
    list.push(row.id);
    children.set(row.parent_id, list);
  }

  const affected: string[] = [];
  const collect = (id: string) => {
    affected.push(id);
    for (const child of children.get(id) ?? []) collect(child);
  };
  collect(documentTypeId);

  if (selected) {
    const estado = resultadoSemContagem(
      await supabase
        .from("visa_type_documents")
        .delete()
        .eq("visa_type_id", visaTypeId)
        .in("document_type_id", affected),
    );
    if (estado.error) return estado;
  } else {
    // Entra no fim da lista deste visto. Antes a posição recomeçava do zero a
    // cada clique, então marcar duas pastas dava a ambas a posição 0 e a ordem
    // ficava indefinida — era o que fazia a lista parecer alfabética.
    const { data: last, error: lastError } = await supabase
      .from("visa_type_documents")
      .select("position")
      .eq("visa_type_id", visaTypeId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastError) return falhou(traduzirErro(lastError));

    let next = (last?.position ?? -1) + 1;

    const estado = resultadoSemContagem(
      await supabase.from("visa_type_documents").upsert(
        affected.map((document_type_id) => ({
          visa_type_id: visaTypeId,
          document_type_id,
          position: next++,
        })),
        { onConflict: "visa_type_id,document_type_id", ignoreDuplicates: true },
      ),
    );
    if (estado.error) return estado;
  }

  revalidatePath(PATH);
  return gravou();
}

/**
 * Reordena uma exigência entre as irmãs, dentro deste visto.
 *
 * A ordem é do VISTO, não do catálogo: o mesmo "Rendimentos" pode vir primeiro
 * no EB-2 NIW e por último no O-1. É esta ordem que o cliente vai enxergar no
 * processo, porque o molde é copiado com ela.
 *
 * Troca só entre irmãs — nó não muda de pai por aqui. Subir "Passaporte" para
 * fora de "Documentos Pessoais" seria mudança de hierarquia, que se faz no
 * catálogo e vale para todos os vistos.
 */
export async function moveVisaDocument(
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  const direction = formData.get("direction");
  if (typeof id !== "string" || (direction !== "up" && direction !== "down")) {
    return falhou("Movimento não informado.");
  }

  const supabase = await createClient();

  const { data: row, error: rowError } = await supabase
    .from("visa_type_documents")
    .select("id, visa_type_id, position, document_type_id")
    .eq("id", id)
    .maybeSingle();

  if (rowError) return falhou(traduzirErro(rowError));
  if (!row) return falhou("Exigência não encontrada.");

  // Irmãs são as exigências do mesmo visto que compartilham o pai no catálogo.
  const [
    { data: catalog, error: catalogError },
    { data: siblingsRaw, error: siblingsError },
  ] = await Promise.all([
    supabase.from("document_types").select("id, parent_id"),
    supabase
      .from("visa_type_documents")
      .select("id, position, document_type_id")
      .eq("visa_type_id", row.visa_type_id)
      .order("position"),
  ]);

  // Sem isto, catálogo falhando deixaria toda pasta sem pai visível, todas
  // viravam irmãs entre si, e a seta moveria a linha errada.
  const arvoreFalhou = catalogError ?? siblingsError;
  if (arvoreFalhou) return falhou(traduzirErro(arvoreFalhou));

  const parentOf = new Map(
    (catalog ?? []).map((n) => [n.id as string, n.parent_id as string | null]),
  );
  const selected = new Set((siblingsRaw ?? []).map((s) => s.document_type_id));

  /** Pai visível: sobe até achar um ancestral que este visto também exige. */
  const visibleParent = (docTypeId: string): string | null => {
    let cursor = parentOf.get(docTypeId) ?? null;
    while (cursor && !selected.has(cursor)) cursor = parentOf.get(cursor) ?? null;
    return cursor;
  };

  const myParent = visibleParent(row.document_type_id);
  const siblings = (siblingsRaw ?? []).filter(
    (s) => visibleParent(s.document_type_id) === myParent,
  );

  const index = siblings.findIndex((s) => s.id === row.id);
  const neighbour = siblings[direction === "up" ? index - 1 : index + 1];
  // Já está na ponta. Não é erro, e a tela já desabilita o botão.
  if (!neighbour) return gravou();

  const estado = resultadoSemContagem(
    await supabase.rpc("swap_positions", {
      p_tabela: "visa_type_documents",
      p_a: row.id,
      p_b: neighbour.id,
    }),
  );
  if (estado.error) return estado;

  revalidatePath(PATH);
  return estado;
}

/** Obrigatoriedade e prazo são do visto, não do catálogo. */
export async function updateVisaDocument(
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") return falhou("Exigência não informada.");

  const patch: Record<string, unknown> = {};

  if (formData.has("is_required")) {
    patch.is_required = formData.get("is_required") === "true";
  }

  if (formData.has("deadline_days")) {
    const raw = formData.get("deadline_days");
    patch.deadline_days =
      typeof raw === "string" ? parseWholeNumber(raw) : null;
  }

  // Nada a mudar não é falha; a tela só não precisa fazer nada.
  if (Object.keys(patch).length === 0) return gravou();

  const supabase = await createClient();
  const estado = resultado(
    await supabase
      .from("visa_type_documents")
      .update(patch)
      .eq("id", id)
      .select("id"),
  );
  if (estado.error) return estado;

  revalidatePath(PATH);
  return estado;
}
