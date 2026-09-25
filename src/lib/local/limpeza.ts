"use client";

import Dexie from "dexie";

import { fecharBancos } from "./sincronizador";

/**
 * Tirar do aparelho o que não é de quem está usando.
 *
 * O espelho guarda contatos, negócios e configuração; a fila guarda o que a
 * pessoa gravou e o servidor ainda não recebeu. Os dois são texto claro no
 * disco — IndexedDB não tem cifra —, e num computador compartilhado ficavam
 * lá indefinidamente: `apagarEspelho` existia desde o primeiro dia e nunca
 * era chamada.
 *
 * Duas frentes, porque uma não cobre a outra:
 *
 * - **Sair** apaga os bancos de quem está saindo. O aviso de gravações
 *   pendentes vem antes; depois de confirmado, apagar é o que foi escolhido.
 * - **Abrir** apaga o que ficou de outra conta. É o caso que sair nunca
 *   alcança, e o mais comum: a sessão expira, o proxy manda para o login,
 *   e nenhuma linha de código do app chega a rodar no navegador.
 *
 * O Cache Storage não entra aqui. Desde `e42f3bf` a casca que o service
 * worker guarda não tem dado nem `userId` dentro — é a mesma para todos.
 */

const PREFIXO = "dulihub-";

const bancosDe = (userId: string) => [
  `${PREFIXO}${userId}`,
  `${PREFIXO}fila-${userId}`,
];

/** Apaga o espelho e a fila deste usuário. */
export async function apagarDadosDoUsuario(userId: string): Promise<void> {
  // `Dexie.delete` espera — para sempre — enquanto houver conexão aberta com
  // aquele nome, e o app mantém uma no singleton do sincronizador.
  fecharBancos();
  for (const nome of bancosDe(userId)) await Dexie.delete(nome);
}

/** Apaga o que sobrou de qualquer outra conta neste aparelho. */
export async function limparOutrosUsuarios(userId: string): Promise<void> {
  // Safari antigo não tem `databases()`. Sem ela não há como descobrir o que
  // ficou, e apagar às cegas exigiria adivinhar ids — some com a versão.
  if (typeof indexedDB === "undefined" || !indexedDB.databases) return;

  const meus = new Set(bancosDe(userId));
  const lista = await indexedDB.databases();

  for (const { name } of lista) {
    if (!name || !name.startsWith(PREFIXO) || meus.has(name)) continue;
    await Dexie.delete(name);
  }
}
