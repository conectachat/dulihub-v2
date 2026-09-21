"use client";

import { useSyncExternalStore } from "react";

import type { ResultadoDaSincronia } from "./espelho";

/**
 * Estado da sincronia, para a tela mostrar.
 *
 * `useSyncExternalStore` e não estado em efeito — a mesma razão de
 * `use-persisted-flag.ts`: o compilador do React acusa `setState` dentro de
 * efeito como cascata de renderização, e aqui o valor vem mesmo de fora do
 * React (a sincronia roda sozinha, fora de qualquer árvore).
 */

export type EstadoDaSincronia = {
  /** Quando o servidor respondeu pela última vez. Nulo: nunca respondeu. */
  em: string | null;
  sincronizando: boolean;
  /** Mensagem do último erro, ou nulo. */
  error: string | null;
  /** Nulo até a primeira tentativa; depois, o que o navegador informa. */
  online: boolean;
};

let estado: EstadoDaSincronia = {
  em: null,
  sincronizando: false,
  error: null,
  online: true,
};

const ouvintes = new Set<() => void>();

function avisar() {
  for (const o of ouvintes) o();
}

export function definirEstado(mudanca: Partial<EstadoDaSincronia>) {
  estado = { ...estado, ...mudanca };
  avisar();
}

export function aplicarResultado(r: ResultadoDaSincronia) {
  definirEstado({
    sincronizando: false,
    error: r.error,
    // Só carimba quando o servidor respondeu. "Sincronizado" depois de uma
    // falha seria a tela mentindo — é o que o indicador existe para evitar.
    em: r.error ? estado.em : r.em,
  });
}

export function estadoAtual() {
  return estado;
}

export function useSincronia(): EstadoDaSincronia {
  return useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    () => estado,
    // No servidor não há espelho: o primeiro quadro mostra o mesmo que um
    // aparelho que ainda não sincronizou.
    () => estado,
  );
}
