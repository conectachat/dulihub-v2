/**
 * A versão publicada — o começo do hash do commit, ou o carimbo de data do
 * build quando o hash não chega (o `Dockerfile` da VPS grava um dos dois em
 * `NEXT_PUBLIC_VERSAO`).
 *
 * Serve a três coisas: nomear o cache do service worker (deploy novo não lê
 * cache do antigo), apontar a URL do worker (`/sw.js?v=...`, que é o que faz
 * o navegador trocar de worker) e dizer a quem usa qual versão está aberta.
 *
 * Em desenvolvimento não há commit: vira `dev`.
 */
export const VERSAO = (
  process.env.NEXT_PUBLIC_VERSAO || "dev"
).slice(0, 12);
