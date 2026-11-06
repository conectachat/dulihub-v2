"use client";

import { createClient } from "@/lib/supabase/client";

import { armazemDo, BancoLocal, TABELAS_ESPELHADAS } from "./banco";
import { armazemDaFila, BancoDaFila } from "./banco-da-fila";
import { drenar } from "./fila";
import { transporteDaFila } from "./transporte-da-fila";
import { aplicarResultado, definirEstado, estadoAtual } from "./estado";
import { sincronizar } from "./espelho";
import { MARCA_DA_SINCRONIA } from "./sessao";
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
 * uma apagaria o avanço da outra. Mas o pedido que chega no meio de uma
 * rodada não é jogado fora: vira mais uma rodada ao terminar. Antes ele era
 * ignorado, e o segundo clique de reordenar esperava o próximo gatilho
 * parecendo perdido (G7).
 */

const INTERVALO_MS = 60_000;

let banco: BancoLocal | null = null;
let fila: BancoDaFila | null = null;
let rodada: Promise<void> | null = null;
let pedidoNoMeio: string | null = null;

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

export function sincronizarAgora(userId: string): Promise<void> {
  if (rodada) {
    pedidoNoMeio = userId;
    return rodada;
  }

  rodada = (async () => {
    try {
      let quem: string | null = userId;
      while (quem) {
        pedidoNoMeio = null;
        await umaRodada(quem);
        quem = pedidoNoMeio;
      }
    } finally {
      rodada = null;
    }
  })();
  return rodada;
}

const SESSAO_ENCERRADA = "Sua sessão terminou. Entre de novo para enviar e receber as alterações.";

/**
 * A sessão que vai junto de cada pedido é desta pessoa?
 *
 * O aparelho sabe de quem é mesmo sem sessão — é o que deixa o espelho abrir
 * offline (`usuario.ts`, G8). Mas sem sessão o cliente do Supabase manda o
 * pedido com a chave anônima: subir viraria recusa da RLS em cada item, e
 * baixar traria a cópia vazia. Então, com rede, a rodada só acontece com a
 * sessão certa.
 */
async function sessaoDe(userId: string): Promise<boolean> {
  try {
    const { data } = await createClient().auth.getSession();
    return data.session?.user.id === userId;
  } catch {
    return false;
  }
}

async function umaRodada(userId: string) {
  definirEstado({ sincronizando: true, online: navigator.onLine });

  if (navigator.onLine && !(await sessaoDe(userId))) {
    definirEstado({ sincronizando: false, error: SESSAO_ENCERRADA });
    return;
  }

  try {
    await drenarFila(userId);

    const armazem = armazemDo(bancoDoUsuario(userId));
    const resultado = await sincronizar(transporteSupabase(), armazem, [
      ...TABELAS_ESPELHADAS,
    ]);
    aplicarResultado(resultado);

    // Guardado no próprio espelho, e só quando o servidor respondeu. Em
    // memória, esta data zerava a cada recarga: um aparelho parado há um mês
    // abria parecendo recém-sincronizado, que é justamente o que o prazo de
    // validade (`sessao.ts`) existe para impedir.
    if (!resultado.error) await armazem.definirMarca(MARCA_DA_SINCRONIA, resultado.em);
  } finally {
    definirEstado({ sincronizando: false });
  }
}

/** Quando o servidor respondeu pela última vez, segundo o disco. */
export async function ultimaSincronia(userId: string): Promise<string | null> {
  return armazemDo(bancoDoUsuario(userId)).marca(MARCA_DA_SINCRONIA);
}

/** Liga os gatilhos de sincronia. Devolve a função que desliga. */
export function ligarSincronia(userId: string): () => void {
  const agora = () => void sincronizarAgora(userId);

  // O carimbo da barra lateral começa com o que está no disco, não em branco:
  // sem isto, recarregar a página faria o aparelho parecer que nunca
  // sincronizou, e ninguém saberia há quanto tempo está parado.
  void ultimaSincronia(userId).then((em) => {
    if (em && !estadoAtual().em) definirEstado({ em });
  });

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
