"use client";

import { armazemDo, BancoLocal, TABELAS_ESPELHADAS } from "./banco";
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
let rodando = false;

export function bancoDoUsuario(userId: string) {
  if (!banco || banco.name !== `dulihub-${userId}`) {
    banco?.close();
    banco = new BancoLocal(userId);
  }
  return banco;
}

export async function sincronizarAgora(userId: string) {
  if (rodando) return;
  rodando = true;
  definirEstado({ sincronizando: true, online: navigator.onLine });

  try {
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
