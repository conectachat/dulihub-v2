"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Preferência sim/não guardada no navegador desta pessoa.
 *
 * O jeito intuitivo — `useState(false)` mais um `useEffect` que lê o
 * `localStorage` na montagem — é o que produzia os erros de
 * `set-state-in-effect`. `useSyncExternalStore` existe exatamente para este
 * caso: React usa o valor do servidor para hidratar e troca pelo do navegador
 * logo em seguida, sem divergência entre o HTML enviado e o renderizado, e sem
 * efeito nenhum ajustando estado depois do fato.
 *
 * O conjunto de ouvintes é do módulo, não do componente: duas instâncias lendo
 * a mesma chave precisam mudar juntas. O evento `storage` do navegador cobre a
 * outra aba, que não dispara o nosso.
 *
 * Armazenamento bloqueado — janela anônima, navegador com site data desligado —
 * lança exceção em vez de devolver nulo. Daí o `try` nos dois lados: a
 * preferência se perde, o app segue.
 */
const ouvintes = new Set<() => void>();

function avisarTodos() {
  for (const ouvinte of ouvintes) ouvinte();
}

export function usePersistedFlag(chave: string, padrao = false) {
  const subscribe = useCallback((aoMudar: () => void) => {
    ouvintes.add(aoMudar);
    window.addEventListener("storage", aoMudar);
    return () => {
      ouvintes.delete(aoMudar);
      window.removeEventListener("storage", aoMudar);
    };
  }, []);

  const lerDoNavegador = useCallback(() => {
    try {
      const guardado = window.localStorage.getItem(chave);
      return guardado === null ? padrao : guardado === "1";
    } catch {
      return padrao;
    }
  }, [chave, padrao]);

  /** No servidor não existe `localStorage`: vale o padrão. */
  const lerDoServidor = useCallback(() => padrao, [padrao]);

  const valor = useSyncExternalStore(subscribe, lerDoNavegador, lerDoServidor);

  const definir = useCallback(
    (proximo: boolean) => {
      try {
        window.localStorage.setItem(chave, proximo ? "1" : "0");
      } catch {
        // Sem onde guardar. A troca vale só enquanto a aba estiver aberta.
      }
      avisarTodos();
    },
    [chave],
  );

  return [valor, definir] as const;
}
