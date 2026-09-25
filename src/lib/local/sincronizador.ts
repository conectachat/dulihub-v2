"use client";

import { armazemDo, BancoLocal, TABELAS_ESPELHADAS } from "./banco";
import { armazemDaFila, BancoDaFila } from "./banco-da-fila";
import { drenar } from "./fila";
import { transporteDaFila } from "./transporte-da-fila";
import { aplicarResultado, definirEstado } from "./estado";
import { sincronizar } from "./espelho";
import { transporteSupabase } from "./transporte-supabase";

/**
 * Quem manda o espelho sincronizar, e quando.
 *
 * Ordem deliberada, do mais confiável ao mais conveniente: ao abrir, ao
 * voltar o foco da janela, quando a rede volta, e a cada minuto com a aba
 * visível. É a mesma escolha do provedor das Observações
 * (`CONFERENCIA_MS`): o banco decide, o resto só adianta.
 *
 * Uma sincronia por vez. Duas ao mesmo tempo disputariam a marca d'água e
 * uma apagaria o avanço da outra.
 */

const INTERVALO_MS = 60_000;

let banco: BancoLocal | null = null;
let fila: BancoDaFila | null = null;
let rodando = false;

export function bancoDoUsuario(userId: string) {
  if (!banco || banco.name !== `dulihub-${userId}`) {
    banco?.close();
    banco = new BancoLocal(userId);
  }
  return banco;
}

/**
 * Fecha as conexões abertas com os bancos deste aparelho.
 *
 * Apagar um banco do IndexedDB **espera** enquanto houver conexão aberta com
 * aquele nome — sem limite. Quem apaga (`limpeza.ts`) chama isto antes.
 */
export function fecharBancos() {
  banco?.close();
  fila?.close();
  banco = null;
  fila = null;
}

/** A fila deste usuário. Banco separado: ver `banco-da-fila.ts`. */
export function filaDoUsuario(userId: string) {
  if (!fila || fila.name !== `dulihub-fila-${userId}`) {
    fila?.close();
    fila = new BancoDaFila(userId);
  }
  return fila;
}

/**
 * Sobe o que este aparelho gravou.
 *
 * Roda **antes** do pull: o que acabou de ser feito precisa estar no servidor
 * antes de a conferência comparar as contagens. E tem `try` próprio porque o
 * carimbo "Sincronizado" fala da leitura — um erro da fila aparece na
 * bandeja, com o item e o motivo, não numa data em vermelho.
 */
async function drenarFila(userId: string) {
  const armazem = armazemDaFila(filaDoUsuario(userId));

  try {
    if (navigator.onLine) await drenar(transporteDaFila(), armazem);
  } catch {
    // Os itens continuam na fila, que é onde a tela os mostra.
  }

  const itens = await armazem.listar();
  definirEstado({
    pendentes: itens.filter((i) => i.estado === "pendente").length,
    conflitos: itens.filter((i) => i.estado === "conflito").length,
  });
}

export async function sincronizarAgora(userId: string) {
  if (rodando) return;
  rodando = true;
  definirEstado({ sincronizando: true, online: navigator.onLine });

  try {
    await drenarFila(userId);

    const resultado = await sincronizar(
      transporteSupabase(),
      armazemDo(bancoDoUsuario(userId)),
      [...TABELAS_ESPELHADAS],
    );
    aplicarResultado(resultado);
  } finally {
    rodando = false;
  }
}

/** Liga os gatilhos de sincronia. Devolve a função que desliga. */
export function ligarSincronia(userId: string): () => void {
  const agora = () => void sincronizarAgora(userId);

  agora();

  const aoFocar = () => {
    if (document.visibilityState === "visible") agora();
  };
  const aoVoltarRede = () => {
    definirEstado({ online: true });
    agora();
  };
  const aoCair = () => definirEstado({ online: false });

  document.addEventListener("visibilitychange", aoFocar);
  window.addEventListener("online", aoVoltarRede);
  window.addEventListener("offline", aoCair);
  const relogio = setInterval(() => {
    if (document.visibilityState === "visible") agora();
  }, INTERVALO_MS);

  return () => {
    document.removeEventListener("visibilitychange", aoFocar);
    window.removeEventListener("online", aoVoltarRede);
    window.removeEventListener("offline", aoCair);
    clearInterval(relogio);
  };
}
