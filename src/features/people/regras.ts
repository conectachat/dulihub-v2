/**
 * Regras do contato que não dependem do banco — testadas em `regras.test.ts`.
 */

/**
 * A ficha mostra Processos e Financeiro?
 *
 * Lead não é cliente: enquanto o negócio está no funil, a ficha dele fica
 * enxuta. O perfil completo chega com o Ganho, isto é, o contrato assinado
 * (decisão do Renato, 3/out).
 *
 * As duas condições a mais existem para nunca esconder trabalho feito: quem
 * já tem processo ou cobrança aparece inteiro, seja qual for o estágio. Em
 * 3/out havia dois contatos com processo sem serem clientes.
 */
export function perfilCompleto({
  estagio,
  processos,
  cobrancas,
}: {
  estagio: string;
  processos: number;
  cobrancas: number;
}): boolean {
  return estagio === "client" || processos > 0 || cobrancas > 0;
}
