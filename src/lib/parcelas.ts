import { emCentavos, emMoeda } from "@/lib/totals";

/**
 * Parcelas e métodos de pagamento, comuns ao Financeiro (cobrança manual) e à
 * forma de pagamento do negócio (entrega 4a). Moram em `lib/` porque uma
 * feature não importa de outra.
 */

export type ParcelaNova = { number: number; amount: number; due_on: string };

export const METODOS = ["pix", "boleto", "cartao", "transferencia", "cripto"] as const;

export type Metodo = (typeof METODOS)[number];

export const ROTULO_DO_METODO: Record<Metodo, string> = {
  pix: "Pix",
  boleto: "Boleto",
  cartao: "Cartão",
  transferencia: "Transferência",
  cripto: "Cripto",
};

/**
 * Soma meses a uma data `AAAA-MM-DD`, **grudando no último dia do mês**.
 *
 * O jeito ingênuo (`setMonth`) transforma 31 de janeiro em 3 de março, e a
 * parcela de fevereiro simplesmente deixa de existir — sem erro nenhum, que é
 * como esse defeito sobrevive.
 */
export function somarMeses(data: string, meses: number): string {
  const [ano, mes, dia] = data.slice(0, 10).split("-").map(Number);

  const alvo = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  // Dia 0 do mês seguinte é o último dia do mês corrente.
  const ultimoDia = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0),
  ).getUTCDate();

  alvo.setUTCDate(Math.min(dia, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

/**
 * As parcelas de uma cobrança, fechando a soma **por construção**.
 *
 * A sobra de centavos vai na primeira: 1000 em 3 vezes dá 333,34 + 333,33 +
 * 333,33. O app antigo dividia igual e conferia a soma na tela com tolerância
 * de dois centavos — conferir o que se podia garantir.
 *
 * `entrada` é o valor da primeira parcela; o resto se divide igualmente entre
 * as demais.
 */
export function gerarParcelas({
  total,
  quantidade,
  primeiroVencimento,
  entrada,
}: {
  total: number;
  quantidade: number;
  primeiroVencimento: string;
  entrada?: number;
}): ParcelaNova[] {
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    throw new Error("A cobrança precisa de ao menos uma parcela.");
  }

  const totalCent = emCentavos(total);
  const vencimento = (i: number) => somarMeses(primeiroVencimento, i);

  if (quantidade === 1) {
    return [{ number: 1, amount: emMoeda(totalCent), due_on: vencimento(0) }];
  }

  const entradaCent = entrada === undefined ? null : emCentavos(entrada);
  if (entradaCent !== null && entradaCent >= totalCent) {
    // Entrada que não deixa nada para as demais é erro de digitação, e gerar
    // parcelas de zero esconderia isso até a hora de cobrar.
    throw new Error("A entrada precisa ser menor que o total.");
  }

  const restante = entradaCent === null ? totalCent : totalCent - entradaCent;
  const quantasDividem = entradaCent === null ? quantidade : quantidade - 1;

  const base = Math.floor(restante / quantasDividem);
  const sobra = restante - base * quantasDividem;

  const parcelas: ParcelaNova[] = [];
  for (let i = 0; i < quantidade; i += 1) {
    let cent: number;
    if (entradaCent !== null) {
      cent = i === 0 ? entradaCent : base + (i === 1 ? sobra : 0);
    } else {
      cent = base + (i === 0 ? sobra : 0);
    }
    parcelas.push({ number: i + 1, amount: emMoeda(cent), due_on: vencimento(i) });
  }

  return parcelas;
}
