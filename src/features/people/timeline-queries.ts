import { createClient } from "@/lib/supabase/server";

import { montarLinhaDoTempo, type TimelineItem } from "./montagem";

export type { TimelineItem };

export const ACTIVITY_LABELS: Record<string, string> = {
  note: "Nota",
  call: "Ligação",
  meeting: "Reunião",
  email: "Email",
  other: "Outro",
  stage_change: "Movimento no funil",
  // Gravado pelo banco quando o cliente envia a ficha pelo link (0035).
  registration_submitted: "Ficha de cadastro",
  // Gravado ao virar cliente: pelo Ganho, por processo ou cobrança, ou à mão (0045).
  virou_cliente: "Virou cliente",
  // Gravado pela confirmação e pelo Refazer da forma de pagamento (0058).
  forma_de_pagamento: "Forma de pagamento",
};

/**
 * Linha do tempo da pessoa: notas e atividades numa lista só.
 *
 * As duas tabelas continuam separadas no banco porque são conceitos
 * diferentes — nota é observação livre, atividade é algo que aconteceu numa
 * data. A fusão acontece na leitura (`montarLinhaDoTempo`), porque quem abre
 * a ficha quer ler a história em ordem, não alternar entre duas listas.
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

  return { items: montarLinhaDoTempo(notes ?? [], activities ?? []), error: null };
}
