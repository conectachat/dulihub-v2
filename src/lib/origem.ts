/**
 * O endereço em que o app foi aberto (`https://dulihub-v2.vercel.app`).
 *
 * Serve para montar link que sai do app — o da ficha de cadastro, que vai
 * pelo WhatsApp. Sai do pedido, e não de uma variável de ambiente: o link
 * gerado em produção aponta para produção, o gerado na prévia, para a prévia.
 *
 * Atrás do proxy da Vercel o protocolo vem em `x-forwarded-proto`. Sem ele
 * (servidor local), `localhost` é http — https ali geraria um link que não
 * abre.
 */
export function origemDoPedido(cabecalhos: { get(nome: string): string | null }): string {
  const host = cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host") ?? "";
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const protocolo = cabecalhos.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${protocolo}://${host}`;
}
