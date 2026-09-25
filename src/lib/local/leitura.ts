"use client";

import type { BancoLocal } from "./banco";
import type { BancoDaFila } from "./banco-da-fila";
import type { ItemDaFila } from "./fila";
import { sobrepor, type LinhaLocal } from "./sobreposicao";

/**
 * Ler uma tabela do aparelho: o espelho com a fila por cima.
 *
 * Mora em `lib/` porque duas features já precisam do mesmo par de passos, e
 * uma cópia em cada uma divergiria no dia em que a sobreposição mudasse — que
 * é exatamente o tipo de divergência silenciosa que esta camada existe para
 * evitar.
 *
 * Quem chama lê os itens da fila **uma vez** e passa para todas as tabelas da
 * mesma tela: abrir a fila por tabela multiplicaria a leitura à toa.
 */

export async function pendentesDaFila(fila: BancoDaFila): Promise<ItemDaFila[]> {
  return fila.fila.orderBy("criada_em").toArray();
}

export async function lerTabela(
  banco: BancoLocal,
  tabela: string,
  itens: ItemDaFila[],
): Promise<LinhaLocal[]> {
  // Fora do tipo gerado: o Dexie guarda linha crua.
  const linhas = (await banco.tabela(tabela).toArray()) as unknown as Record<
    string,
    unknown
  >[];
  return sobrepor(tabela, linhas, itens);
}
