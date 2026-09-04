import { createClient } from "@/lib/supabase/server";

export type TimelineItem = {
  id: string;
  kind: "note" | "activity";
  /** Para atividade: o tipo registrado. Para nota: sempre "note". */
  type: string;
  body: string;
  occurredAt: string;
  authorId: string | null;
  authorName: string | null;
  /** Registro gerado pelo sistema não se edita nem se apaga. */
  system: boolean;
};

/** Tipos que o sistema cria sozinho — não são lançamentos de quem usa. */
const SYSTEM_TYPES = new Set(["stage_change"]);

export const ACTIVITY_LABELS: Record<string, string> = {
  note: "Nota",
  call: "Ligação",
  meeting: "Reunião",
  email: "Email",
  other: "Outro",
  stage_change: "Movimento no funil",
};

/**
 * Linha do tempo da pessoa: notas e atividades numa lista só.
 *
 * As duas tabelas continuam separadas no banco porque são conceitos
 * diferentes — nota é observação livre, atividade é algo que aconteceu numa
 * data. A fusão acontece aqui, na leitura, porque quem abre a ficha quer ler
 * a história em ordem, não alternar entre duas listas.
 */
export async function getTimeline(personId: string): Promise<{
  items: TimelineItem[];
  error: string | null;
}> {
  const supabase = await createClient();

  const [
    { data: notes, error: notesError },
    { data: activities, error: activitiesError },
  ] = await Promise.all([
    supabase
      .from("notes")
      .select("id, body, created_at, created_by, author:profiles(full_name, email)")
      .eq("person_id", personId)
      .order("created_at", { ascending: false }),
    supabase
      .from("activities")
      .select(
        "id, type, description, occurred_at, created_by, author:profiles(full_name, email)",
      )
      .eq("person_id", personId)
      .order("occurred_at", { ascending: false }),
  ]);

  // Falha parcial é o pior caso aqui: notas carregam, atividades não, e a
  // pessoa lê metade da história achando que é toda ela.
  const falha = notesError ?? activitiesError;
  if (falha) return { items: [], error: falha.message };

  type AuthorRow = { full_name: string | null; email: string } | null;
  const nameOf = (author: AuthorRow) =>
    author?.full_name ?? author?.email ?? null;

  const fromNotes: TimelineItem[] = (notes ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      body: string;
      created_at: string;
      created_by: string | null;
      author: AuthorRow;
    };
    return {
      id: r.id,
      kind: "note",
      type: "note",
      body: r.body,
      occurredAt: r.created_at,
      authorId: r.created_by,
      authorName: nameOf(r.author),
      system: false,
    };
  });

  const fromActivities: TimelineItem[] = (activities ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      type: string;
      description: string | null;
      occurred_at: string;
      created_by: string | null;
      author: AuthorRow;
    };
    return {
      id: r.id,
      kind: "activity",
      type: r.type,
      body: r.description ?? "",
      occurredAt: r.occurred_at,
      authorId: r.created_by,
      authorName: nameOf(r.author),
      system: SYSTEM_TYPES.has(r.type),
    };
  });

  const items = [...fromNotes, ...fromActivities].sort(
    (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
  );

  return { items, error: null };
}
