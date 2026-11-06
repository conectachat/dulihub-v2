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
 *
 * ## O dono do aparelho, guardado (G8 da revisão de novembro)
 *
 * O login guardado dura cerca de uma hora. Sem rede para renová-lo, o
 * `getSession()` tenta por ~25 s e devolve nulo — e o app dizia "Sua sessão
 * terminou neste aparelho" justamente quando o espelho era a única fonte.
 * A sessão continua no disco; só a pergunta é que não tem resposta.
 *
 * Por isso quem usou por último fica anotado (`DONO`), e é ele quem abre o
 * banco local:
 *
 * - sem rede, sem nem perguntar à sessão (acaba a espera de 25 s);
 * - com rede ruim, quando a sessão não renovou por falha de rede.
 *
 * Sessão encerrada de verdade (nula sem erro de rede) esquece o dono, e sair
 * também (`limpeza.ts`). Gravar continua exigindo sessão válida para subir:
 * o sincronizador confere antes de mandar.
 */

type EstadoDoUsuario = {
  userId: string | null;
  /** Da sessão guardada: é o único nome que existe sem internet. */
  email: string | null;
  carregado: boolean;
};

let estado: EstadoDoUsuario = { userId: null, email: null, carregado: false };

const DONO = "dulihub:dono-do-aparelho";

type Dono = { id: string; email: string | null };

function lerDono(): Dono | null {
  try {
    const bruto = localStorage.getItem(DONO);
    const dono = bruto ? (JSON.parse(bruto) as Dono) : null;
    return dono && typeof dono.id === "string" ? dono : null;
  } catch {
    return null;
  }
}

function lembrarDono(dono: Dono) {
  try {
    localStorage.setItem(DONO, JSON.stringify(dono));
  } catch {
    // Aba anônima ou cota: sem o dono guardado, só não abre offline.
  }
}

/** Sair, e sessão encerrada: ninguém abre offline o banco de quem saiu. */
export function esquecerDonoDoAparelho() {
  try {
    localStorage.removeItem(DONO);
  } catch {
    // Idem.
  }
}

/** A sessão não renovou porque a rede falhou — não porque acabou. */
function falhouPorRede(erro: { name?: string; status?: number } | null): boolean {
  return erro?.name === "AuthRetryableFetchError" || erro?.status === 0;
}

const semRede = () => typeof navigator !== "undefined" && navigator.onLine === false;
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
    const guardado = lerDono();
    const peloDono = (dono: Dono | null) =>
      definir({ userId: dono?.id ?? null, email: dono?.email ?? null, carregado: true });

    // Sem rede, perguntar à sessão só custa ~25 s para ouvir "não sei".
    if (semRede() && guardado) {
      peloDono(guardado);
      return;
    }

    try {
      const { data, error } = await createClient().auth.getSession();
      const usuario = data.session?.user;

      if (usuario) {
        const dono = { id: usuario.id, email: usuario.email ?? null };
        lembrarDono(dono);
        peloDono(dono);
      } else if (falhouPorRede(error) || semRede()) {
        peloDono(guardado);
      } else {
        esquecerDonoDoAparelho();
        peloDono(null);
      }
    } catch {
      peloDono(semRede() ? guardado : null);
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
