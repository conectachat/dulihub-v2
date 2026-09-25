"use client";

import type { Deposito } from "./sincronia";

import { filaDoUsuario } from "@/lib/local/sincronizador";
import { usuarioLocal } from "@/lib/local/usuario";

/**
 * O depósito das Observações, no IndexedDB deste aparelho.
 *
 * Fica no banco da fila (`dulihub-fila-<user>`) e não no espelho, pela mesma
 * razão que a fila: é trabalho que só existe aqui, enquanto o espelho é
 * cópia descartável do servidor. Sair da conta apaga os dois — e o aviso de
 * pendências conta este texto junto, senão "sair e perder" perderia sem
 * dizer o quê.
 *
 * Falhar aqui não pode travar a edição: sem aparelho onde guardar, a
 * sincronia volta a ser o que era, e o texto continua indo ao banco.
 */
export function depositoLocal(paginaId: string): Deposito {
  // Nem todo lugar tem onde guardar: aba anônima do Safari, armazenamento
  // bloqueado, ambiente de teste sem IndexedDB. Sem depósito a sincronia
  // volta a ser o que era — o texto continua indo ao banco —, e é por isso
  // que a falta dele nunca vira exceção para quem está digitando.
  const banco = async () => {
    try {
      const { userId } = await usuarioLocal();
      if (!userId) return null;
      const fila = filaDoUsuario(userId);
      await fila.open();
      return fila;
    } catch {
      return null;
    }
  };

  return {
    async guardar(update) {
      const b = await banco();
      if (!b) return "";
      try {
        const id = await b.observacoes.add({
          page_id: paginaId,
          update,
          criada_em: new Date().toISOString(),
        });
        return String(id);
      } catch {
        return "";
      }
    },

    async pendentes() {
      const b = await banco();
      if (!b) return [];
      try {
        const linhas = await b.observacoes.where("page_id").equals(paginaId).toArray();
        return linhas.map((l) => ({ chave: String(l.id), update: l.update }));
      } catch {
        return [];
      }
    },

    async limpar(chaves) {
      const b = await banco();
      if (!b) return;
      const ids = chaves.map(Number).filter((n) => !Number.isNaN(n));
      await b.observacoes.bulkDelete(ids).catch(() => {});
    },
  };
}
