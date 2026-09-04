"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { gravou, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";

/** @deprecated Use `ActionState` de `@/lib/action-state`. */
export type VisaState = ActionState;

const PATH = "/configuracoes/tipos-de-visto";

const visaSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(120),
  description: z.string().trim().optional(),
  base_price: z
    .string()
    .trim()
    .optional()
    .transform((v) => {
      if (!v) return null;
      // Aceita "12.500,00" e "12500.00": o usuário digita como fala.
      const n = Number(v.replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }),
  currency: z.enum(["BRL", "USD"]).default("BRL"),
  estimated_days: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) || null : null)),
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

function humanize(message: string) {
  if (message.includes("visa_types_org_name_unique")) {
    return "Já existe um tipo de visto com esse nome.";
  }
  return message;
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
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const id = formData.get("id");
  const isActive = formData.get("is_active") === "on";

  if (typeof id === "string" && id) {
    const { error } = await supabase
      .from("visa_types")
      .update({ ...parsed.data, is_active: isActive })
      .eq("id", id);
    if (error) return { error: humanize(error.message) };
  } else {
    const orgId = await organizationId();
    if (!orgId) return { error: "Sua conta não está vinculada a nenhuma organização." };

    const { error } = await supabase
      .from("visa_types")
      .insert({ ...parsed.data, is_active: isActive, organization_id: orgId });
    if (error) return { error: humanize(error.message) };
  }

  revalidatePath(PATH);
  return gravou();
}

export async function deleteVisaType(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();
  await supabase.from("visa_types").delete().eq("id", id);

  revalidatePath(PATH);
}

// ------------------------------------------------------------- etapas do molde

const stageSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da etapa").max(120),
  estimated_days: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) || null : null)),
});

export async function createVisaStage(
  _prev: VisaState,
  formData: FormData,
): Promise<VisaState> {
  const parsed = stageSchema.safeParse({
    name: formData.get("name"),
    estimated_days: formData.get("estimated_days"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

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

  if (error) return { error: error.message };

  revalidatePath(PATH);
  return gravou();
}

export async function updateVisaStage(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const patch: Record<string, unknown> = {};

  const name = formData.get("name");
  if (typeof name === "string" && name.trim()) patch.name = name.trim();

  if (formData.has("is_required")) {
    patch.is_required = formData.get("is_required") === "true";
  }

  if (formData.has("estimated_days")) {
    const raw = formData.get("estimated_days");
    patch.estimated_days =
      typeof raw === "string" && raw.trim() ? Number(raw) || null : null;
  }

  if (Object.keys(patch).length === 0) return;

  const supabase = await createClient();
  await supabase.from("visa_stages").update(patch).eq("id", id);

  revalidatePath(PATH);
}

export async function moveVisaStage(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const direction = formData.get("direction");
  if (typeof id !== "string" || (direction !== "up" && direction !== "down")) return;

  const supabase = await createClient();

  const { data: node } = await supabase
    .from("visa_stages")
    .select("id, visa_type_id, parent_id, position")
    .eq("id", id)
    .maybeSingle();

  if (!node) return;

  let query = supabase
    .from("visa_stages")
    .select("id, position")
    .eq("visa_type_id", node.visa_type_id)
    .order("position", { ascending: direction === "down" })
    .limit(1);

  query = node.parent_id
    ? query.eq("parent_id", node.parent_id)
    : query.is("parent_id", null);

  const { data: neighbour } = await query[direction === "down" ? "gt" : "lt"](
    "position",
    node.position,
  ).maybeSingle();

  if (!neighbour) return;

  await supabase.from("visa_stages").update({ position: neighbour.position }).eq("id", node.id);
  await supabase.from("visa_stages").update({ position: node.position }).eq("id", neighbour.id);

  revalidatePath(PATH);
}

export async function deleteVisaStage(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();
  await supabase.from("visa_stages").delete().eq("id", id);

  revalidatePath(PATH);
}

// ------------------------------------------------- documentos exigidos do visto

/**
 * Marca ou desmarca um nó do catálogo para este tipo de visto.
 *
 * Marcar um grupo alcança os descendentes, mas a gravação é nó a nó. Guardar
 * só o grupo faria com que acrescentar um documento ao catálogo depois mudasse,
 * calado, o que este visto já exigia — e a decisão foi que nada muda sozinho.
 */
export async function toggleVisaDocument(formData: FormData): Promise<void> {
  const visaTypeId = formData.get("visa_type_id");
  const documentTypeId = formData.get("document_type_id");
  const selected = formData.get("selected") === "true";

  if (typeof visaTypeId !== "string" || typeof documentTypeId !== "string") return;

  const supabase = await createClient();

  // Descobre o nó e todos abaixo dele.
  const { data: all } = await supabase
    .from("document_types")
    .select("id, parent_id");

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
    await supabase
      .from("visa_type_documents")
      .delete()
      .eq("visa_type_id", visaTypeId)
      .in("document_type_id", affected);
  } else {
    // Entra no fim da lista deste visto. Antes a posição recomeçava do zero a
    // cada clique, então marcar duas pastas dava a ambas a posição 0 e a ordem
    // ficava indefinida — era o que fazia a lista parecer alfabética.
    const { data: last } = await supabase
      .from("visa_type_documents")
      .select("position")
      .eq("visa_type_id", visaTypeId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    let next = (last?.position ?? -1) + 1;

    await supabase.from("visa_type_documents").upsert(
      affected.map((document_type_id) => ({
        visa_type_id: visaTypeId,
        document_type_id,
        position: next++,
      })),
      { onConflict: "visa_type_id,document_type_id", ignoreDuplicates: true },
    );
  }

  revalidatePath(PATH);
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
export async function moveVisaDocument(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const direction = formData.get("direction");
  if (typeof id !== "string" || (direction !== "up" && direction !== "down")) return;

  const supabase = await createClient();

  const { data: row } = await supabase
    .from("visa_type_documents")
    .select("id, visa_type_id, position, document_type_id")
    .eq("id", id)
    .maybeSingle();

  if (!row) return;

  // Irmãs são as exigências do mesmo visto que compartilham o pai no catálogo.
  const [{ data: catalog }, { data: siblingsRaw }] = await Promise.all([
    supabase.from("document_types").select("id, parent_id"),
    supabase
      .from("visa_type_documents")
      .select("id, position, document_type_id")
      .eq("visa_type_id", row.visa_type_id)
      .order("position"),
  ]);

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
  if (!neighbour) return;

  // Posição intermediária antes da troca, para nunca haver duas iguais no meio
  // do caminho caso um índice único apareça depois.
  await supabase.from("visa_type_documents").update({ position: -1 }).eq("id", row.id);
  await supabase
    .from("visa_type_documents")
    .update({ position: row.position })
    .eq("id", neighbour.id);
  await supabase
    .from("visa_type_documents")
    .update({ position: neighbour.position })
    .eq("id", row.id);

  revalidatePath(PATH);
}

/** Obrigatoriedade e prazo são do visto, não do catálogo. */
export async function updateVisaDocument(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const patch: Record<string, unknown> = {};

  if (formData.has("is_required")) {
    patch.is_required = formData.get("is_required") === "true";
  }

  if (formData.has("deadline_days")) {
    const raw = formData.get("deadline_days");
    patch.deadline_days =
      typeof raw === "string" && raw.trim() ? Number(raw) || null : null;
  }

  if (Object.keys(patch).length === 0) return;

  const supabase = await createClient();
  await supabase.from("visa_type_documents").update(patch).eq("id", id);

  revalidatePath(PATH);
}
