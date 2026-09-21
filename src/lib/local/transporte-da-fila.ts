"use client";

import { createClient } from "@/lib/supabase/client";

import type { TransporteDaFila } from "./fila";

/**
 * O que a fila usa para subir: PostgREST comum, com a RLS de quem está
 * logado. Nenhum caminho novo de escrita — a policy decide igual, venha a
 * gravação de uma Server Action ou daqui.
 *
 * Todo `update` e todo `delete` levam `.select("id")`, pela razão que
 * `lib/gravar.ts` documenta: sem contar linhas, recusa da RLS é
 * indistinguível de sucesso. A fila conta, e é o que a torna honesta.
 *
 * `person_tags` não passa por aqui: ela não tem `id`, e as operações são
 * chaveadas por ele. Quando os Contatos migrarem, entra uma operação de
 * chave composta — e o tipo `Operacao` vai obrigar a tratar o caso.
 */
export function transporteDaFila(
  // Injetável para o teste que fala com o banco de verdade.
  supabase: ReturnType<typeof createClient> = createClient(),
): TransporteDaFila {
  const de = (tabela: string) =>
    (
      supabase as unknown as {
        from: (t: string) => ReturnType<typeof supabase.from>;
      }
    ).from(tabela);

  return {
    async inserir(tabela, linha) {
      const { error } = await de(tabela).insert(linha as never);
      return { error };
    },

    async atualizar(tabela, id, patch) {
      const { data, error } = await de(tabela)
        .update(patch as never)
        .eq("id", id)
        .select("id");
      return { error, linhas: data?.length ?? 0 };
    },

    async apagar(tabela, id) {
      const { data, error } = await de(tabela).delete().eq("id", id).select("id");
      return { error, linhas: data?.length ?? 0 };
    },

    async existe(tabela, id) {
      const { data } = await de(tabela).select("id").eq("id", id).maybeSingle();
      return Boolean(data);
    },

    async rpc(nome, args) {
      const { error } = await (
        supabase as unknown as {
          rpc: (n: string, a: Record<string, unknown>) => Promise<{ error: unknown }>;
        }
      ).rpc(nome, args);
      return { error: (error as { code?: string; message?: string } | null) ?? null };
    },
  };
}
