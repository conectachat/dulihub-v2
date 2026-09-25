"use client";

import Dexie, { type Table } from "dexie";

import type { ArmazemDaFila, ItemDaFila } from "./fila";

/**
 * A fila mora num banco **separado** do espelho.
 *
 * Não é organização: é para que apagar o espelho nunca leve junto gravação
 * que ninguém viu subir. O espelho é descartável por definição — some numa
 * troca de versão, e a próxima sincronia o refaz em segundos. A fila não:
 * cada item ali é uma coisa que a pessoa fez e o servidor ainda não sabe.
 *
 * Por isso também a versão daqui não acompanha a do espelho.
 */

const VERSAO_DA_FILA = 2;

/** Um pedaço de texto das Observações que o banco ainda não recebeu. */
export type PedacoGuardado = {
  id?: number;
  page_id: string;
  update: Uint8Array;
  criada_em: string;
};

export class BancoDaFila extends Dexie {
  fila!: Table<ItemDaFila, string>;
  observacoes!: Table<PedacoGuardado, number>;

  constructor(userId: string) {
    super(`dulihub-fila-${userId}`);
    this.version(VERSAO_DA_FILA).stores({
      // `criada_em` indexado: a ordem de envio é a ordem em que foi feito.
      fila: "id, criada_em, alvo, estado",
      // O texto digitado nas Observações, enquanto o banco não confirma.
      // Mora aqui, e não no espelho, pelo mesmo motivo da fila: é trabalho
      // que só existe neste aparelho.
      observacoes: "++id, page_id",
    });
  }
}

export function armazemDaFila(banco: BancoDaFila): ArmazemDaFila {
  return {
    async listar() {
      return banco.fila.orderBy("criada_em").toArray();
    },
    async gravar(item) {
      await banco.fila.put(item);
    },
    async apagar(id) {
      await banco.fila.delete(id);
    },
  };
}
