/**
 * Regras puras da importação do app antigo, testadas sem rede em
 * `src/lib/importacao.test.ts`.
 *
 * JavaScript, e não TypeScript, porque o script roda com `node` puro.
 */

/** @typedef {"contact" | "opportunity" | "client"} Estagio */

/** @type {Record<Estagio, number>} */
const ORDEM = { contact: 0, opportunity: 1, client: 2 };

/**
 * O maior estágio entre o que o banco novo já tem e o que o app antigo diz.
 *
 * Rodar a importação de novo não pode rebaixar quem virou cliente no app
 * novo — e, desde a 0045, o banco recusaria o lote inteiro.
 *
 * @param {Estagio | null | undefined} doBanco
 * @param {Estagio} doAntigo
 * @returns {Estagio}
 */
export function estagioFinal(doBanco, doAntigo) {
  if (!doBanco) return doAntigo;
  return ORDEM[doBanco] >= ORDEM[doAntigo] ? doBanco : doAntigo;
}

/**
 * O DDI como o banco o guarda desde a 0040: "+" e os dígitos.
 *
 * @param {string | null | undefined} ddi
 * @returns {string | null}
 */
export function ddiGravado(ddi) {
  const digitos = String(ddi ?? "").replace(/\D/g, "");
  return digitos === "" ? null : `+${digitos}`;
}
