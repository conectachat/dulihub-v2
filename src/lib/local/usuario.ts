"use client";

import { useSyncExternalStore } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * De quem é este aparelho, perguntado ao próprio aparelho.
 *
 * O espelho e a fila são por usuário (`dulihub-<user_id>`), e quem escolhe
 * qual abrir não pode ser o HTML: a casca das rotas migradas fica guardada
 * pelo service worker para abrir offline, e casca é HTML **igual para todo
 * mundo**. Enquanto ela carregava o `userId` resolvido no servidor, um
 * computador compartilhado abriria, sem internet, o banco local da pessoa
 * anterior.
 *
 * `getSession` e não `getUser`: `getUser` fala com o servidor, e offline
 * devolveria nulo — o aparelho perderia o próprio espelho justamente quando
 * ele é a única fonte. Isto não contraria a regra do `AGENTS.md`, que trata
 * de **decidir permissão**; aqui só se decide qual banco local abrir. Quem
 * decide permissão continua sendo a RLS, no servidor, a cada leitura e a
 * cada gravação que sobe.
 */

type EstadoDoUsuario = {
  userId: string | null;
  /** Da sessão guardada: é o único nome que existe sem internet. */
  email: string | null;
  carregado: boolean;
};

let estado: EstadoDoUsuario = { userId: null, email: null, carregado: false };
let buscando: Promise<void> | null = null;
const ouvintes = new Set<() => void>();

function definir(novo: EstadoDoUsuario) {
  estado = novo;
  for (const o of ouvintes) o();
}

function buscar() {
  // `async` e não `.then` encadeado: montar o cliente pode lançar de forma
  // síncrona (variável de ambiente faltando, cliente falso num teste), e aí
  // o `.catch` nem chegava a ser instalado — virava rejeição solta, que em
  // produção derruba a tela inteira.
  buscando ??= (async () => {
    try {
      const { data } = await createClient().auth.getSession();
      definir({
        userId: data.session?.user.id ?? null,
        email: data.session?.user.email ?? null,
        carregado: true,
      });
    } catch {
      definir({ userId: null, email: null, carregado: true });
    }
  })();
  return buscando;
}

/** Para o teste e para a troca de conta: a próxima pergunta vai ao navegador. */
export function esquecerUsuarioLocal() {
  buscando = null;
  estado = { userId: null, email: null, carregado: false };
}

/** Fora de componente: quem grava precisa saber de quem é o aparelho. */
export async function usuarioLocal(): Promise<EstadoDoUsuario> {
  await buscar();
  return estado;
}

export function useUsuarioLocal(): EstadoDoUsuario {
  return useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb);
      void buscar();
      return () => ouvintes.delete(cb);
    },
    () => estado,
    // No servidor não há sessão guardada: o primeiro quadro é o mesmo de um
    // aparelho que ainda não respondeu, e o cliente resolve logo depois.
    () => estado,
  );
}
