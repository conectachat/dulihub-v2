/**
 * Um identificador novo, que funciona onde `crypto.randomUUID` não existe.
 *
 * `randomUUID` só existe em **contexto seguro**: https ou localhost. Enquanto
 * tudo era gravado no servidor isso não importava — lá é Node, e sempre há.
 * Com a gravação no aparelho, testar o app pelo IP da rede local
 * (`http://192.168.0.10:3000`, que é como se abre no celular) derrubaria
 * **toda** gravação com "crypto.randomUUID is not a function".
 *
 * A reserva usa `getRandomValues`, que existe em qualquer contexto, e monta um
 * UUID v4 à mão. O último recurso, sem `crypto` nenhum, serve só para não
 * quebrar em ambiente de teste — o id não precisa ser imprevisível, precisa
 * ser único: é a chave de idempotência do replay, não um segredo.
 */
export function novoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  // Versão 4, variante RFC 4122.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
