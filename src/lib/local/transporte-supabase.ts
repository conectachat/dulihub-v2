"use client";

import { createClient } from "@/lib/supabase/client";

import type { Lapide, Linha, TransporteDoEspelho } from "./espelho";

/**
 * O transporte do espelho: PostgREST comum, com a RLS de quem está logado.
 *
 * Nenhum caminho novo de leitura — é a razão de não usarmos PowerSync nem
 * ElectricSQL, que descreveriam quem-vê-o-quê fora do Postgres. Aqui, se a
 * policy esconde, o espelho não recebe.
 */
export function transporteSupabase(
  // Injetável para o teste que fala com o banco de verdade
  // (`tests/rls/espelho.test.ts`) usar um cliente de node com login real.
  supabase: ReturnType<typeof createClient> = createClient(),
): TransporteDoEspelho {
  // O motor é agnóstico de tabela; o cliente tipado exige nomes conhecidos, e
  // a lista de tabelas espelhadas vive em `banco.ts`.
  const de = (tabela: string) =>
    (supabase as unknown as {
      from: (t: string) => ReturnType<typeof supabase.from>;
    }).from(tabela);

  return {
    async mudancas(tabela, desde, limite) {
      let consulta = de(tabela).select("*").order("updated_at").limit(limite);
      // `gte`, não `gt`: com o recuo de 5 s, reaplicar linha já vista é
      // barato, e é o que evita perder a que commitou fora de ordem.
      if (desde) consulta = consulta.gte("updated_at", desde);

      const { data, error } = await consulta;
      if (error) throw new Error(error.message);
      return (data ?? []) as Linha[];
    },

    async tudo(tabela) {
      const { data, error } = await de(tabela).select("*");
      if (error) throw new Error(error.message);
      return (data ?? []) as Linha[];
    },

    async lapides(desde) {
      let consulta = supabase
        .from("deleted_rows")
        .select("tabela, id, deleted_at")
        .order("deleted_at");
      if (desde) consulta = consulta.gte("deleted_at", desde);

      const { data, error } = await consulta;
      if (error) throw new Error(error.message);
      return (data ?? []) as Lapide[];
    },

    async manifesto() {
      const { data, error } = await supabase.rpc("sync_manifesto");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  };
}
