/**
 * Soma valores agrupando por moeda.
 *
 * O CRM somava `value` sem olhar `currency` e rotulava o resultado como R$.
 * Um EB-2 NIW de US$ 12.000 ao lado de um negócio de R$ 8.000 virava
 * "R$ 20.000 em negociação" — número que não existe, e que subestima o lado em
 * dólar em umas cinco vezes.
 *
 * Não há conversão aqui de propósito. Converter exige uma taxa, e taxa exige
 * uma data: o valor de uma proposta fechada em março não vale ser reavaliado
 * pela cotação de hoje toda vez que alguém abre o quadro. Enquanto não houver
 * decisão sobre isso, mostrar as moedas lado a lado é a única leitura honesta.
 */
export type PorMoeda = Record<string, number>;

export function somarPorMoeda(
  itens: { value: number | null; currency: string }[],
): PorMoeda {
  const total: PorMoeda = {};
  for (const item of itens) {
    if (!item.value) continue;
    total[item.currency] = (total[item.currency] ?? 0) + item.value;
  }
  return total;
}

/** Junta vários agrupamentos num só — usado para o total do funil inteiro. */
export function juntarMoedas(partes: PorMoeda[]): PorMoeda {
  const total: PorMoeda = {};
  for (const parte of partes) {
    for (const [moeda, valor] of Object.entries(parte)) {
      total[moeda] = (total[moeda] ?? 0) + valor;
    }
  }
  return total;
}

/**
 * Formata dinheiro em pt-BR.
 *
 * Existia em duas cópias que **divergiam**: o quadro do CRM mostrava
 * `R$ 12.500` e a ficha da pessoa `R$ 12.500,00`, para o mesmo registro.
 * Centavos aparecem só quando existem — quantia redonda com `,00` é ruído numa
 * lista, e quantia quebrada sem centavos é informação perdida.
 */
export function formatarMoeda(valor: number, moeda: string) {
  const temCentavos = Math.round(valor * 100) % 100 !== 0;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: moeda,
    minimumFractionDigits: temCentavos ? 2 : 0,
    maximumFractionDigits: temCentavos ? 2 : 0,
  }).format(valor);
}

/** "R$ 8.000 e US$ 12.000" — para cabeçalho e rodapé de coluna. */
export function formatarPorMoeda(total: PorMoeda): string {
  const partes = Object.entries(total)
    .filter(([, valor]) => valor !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([moeda, valor]) => formatarMoeda(valor, moeda));

  if (partes.length === 0) return "";
  if (partes.length === 1) return partes[0];
  return partes.slice(0, -1).join(", ") + " e " + partes[partes.length - 1];
}
