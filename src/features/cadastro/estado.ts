import type { ContatoParecido } from "@/lib/parecidos";

/**
 * O que as ações da ficha devolvem para o formulário.
 *
 * Diferente do `ActionState` da casa por um motivo: a ficha tem vinte campos,
 * e o erro precisa apontar **qual**. Mora fora dos arquivos de ação porque
 * módulo `"use server"` só exporta função assíncrona.
 */
export type EstadoDaFicha = {
  /** Frase para quem está preenchendo. `null` quando gravou. */
  error: string | null;
  /** Erro por campo, na chave do campo (`tax_id`, `dependents.0`, `aceite`). */
  campos?: Record<string, string>;
  /**
   * Só na porta da equipe: e-mail ou telefone novos que já existem em outro
   * contato (CON-8). Com eles, **não gravou** — a tela pergunta antes.
   */
  parecidos?: ContatoParecido[];
};
