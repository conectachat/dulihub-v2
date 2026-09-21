/**
 * A versão publicada — o começo do hash do commit que a Vercel construiu.
 *
 * Serve a três coisas: nomear o cache do service worker (deploy novo não lê
 * cache do antigo), apontar a URL do worker (`/sw.js?v=...`, que é o que faz
 * o navegador trocar de worker) e dizer a quem usa qual versão está aberta.
 *
 * Em desenvolvimento não há commit: vira `dev`.
 */
export const VERSAO = (
  process.env.NEXT_PUBLIC_VERSAO ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  "dev"
).slice(0, 12);
