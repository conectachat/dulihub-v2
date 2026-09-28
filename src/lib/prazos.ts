/**
 * Prazo vencido e dias até ele — a regra que mais de uma feature usa.
 *
 * Mora em `lib/` porque o Financeiro (parcela vencida) e a tela Início
 * (alertas) precisam da **mesma** regra, e feature não importa de feature.
 * Duas cópias divergiriam — o app antigo calculava "vencido" em dois lugares,
 * de dois jeitos, e as duas telas discordavam.
 *
 * Datas em `AAAA-MM-DD`, o formato das colunas `date`; `hoje` vem de
 * `hojeEmSaoPaulo()`.
 */

const UM_DIA = 24 * 60 * 60 * 1000;

/**
 * O prazo já passou?
 *
 * O dia do vencimento ainda é de quem deve: chamar de vencido às 00h01 do
 * próprio dia é cobrar uma dívida que ainda não existe.
 */
export function venceu(prazo: string, hoje: string): boolean {
  return prazo.slice(0, 10) < hoje;
}

/** Dias corridos de `hoje` até `data`. Negativo: já passou. */
export function diasAte(data: string, hoje: string): number {
  const em = (d: string) => {
    const [a, m, dia] = d.slice(0, 10).split("-").map(Number);
    return Date.UTC(a, m - 1, dia);
  };
  return Math.round((em(data) - em(hoje)) / UM_DIA);
}
