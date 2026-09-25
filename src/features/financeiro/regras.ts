/**
 * As contas do a receber — puras, testadas em `regras.test.ts`.
 *
 * Todas existem por causa de um jeito conhecido de o dinheiro sair errado:
 * centavo que some no arredondamento, vencimento que pula de mês, cotação
 * chutada, e soma de dólar com real.
 *
 * Aqui não há banco nem tela. É o que permite mexer nas contas com a
 * segurança de um teste que roda em milissegundos.
 */

export type Situacao = "paga" | "vencida" | "pendente";

export type ParcelaNova = { number: number; amount: number; due_on: string };

type ParaSituacao = { due_on: string; paid_on: string | null };

/** Valores em centavos: dinheiro em ponto flutuante perde o troco. */
const emCentavos = (valor: number) => Math.round(valor * 100);
const emMoeda = (centavos: number) => centavos / 100;

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

/**
 * Paga, vencida ou pendente — a partir das datas, nunca de uma coluna.
 *
 * O dia do vencimento ainda é do cliente: chamar de vencida às 00h01 do
 * próprio dia é cobrar uma dívida que ainda não existe.
 *
 * `hoje` vem de `hojeEmSaoPaulo()`. O app antigo calculava isto em dois
 * lugares, de dois jeitos, e as duas telas discordavam.
 */
export function situacaoDaParcela(parcela: ParaSituacao, hoje: string): Situacao {
  if (parcela.paid_on) return "paga";
  return parcela.due_on < hoje ? "vencida" : "pendente";
}

/**
 * Quanto entrou em real — a **única** conversão do sistema.
 *
 * Exige a cotação junto, e devolve nulo quando ela falta. Devolver o número
 * cru poria mil reais no caixa onde entraram mil dólares, e nada na tela
 * denunciaria.
 */
export function emReais(
  valor: number,
  moeda: string,
  cotacao: number | null | undefined,
): number | null {
  if (moeda === "BRL") return valor;
  if (!cotacao || cotacao <= 0) return null;
  return emMoeda(Math.round(valor * cotacao * 100));
}

export type ResumoDoRecebivel = {
  total: number;
  pago: number;
  aberto: number;
  vencido: number;
  parcelas: number;
  pagas: number;
};

/**
 * O resumo de uma cobrança, somado das parcelas.
 *
 * Nada disso é coluna. No app antigo `valor_pago` e `valor_pendente` eram
 * mantidos por gatilho e divergiam do que as parcelas diziam — e, quando
 * divergem, ninguém sabe qual dos dois está certo.
 *
 * Tudo na moeda da cobrança: converter aqui exigiria uma cotação por parcela,
 * e a cotação pertence ao dia do pagamento.
 */
export function resumoDoRecebivel(
  parcelas: (ParaSituacao & { amount: number })[],
  hoje: string,
): ResumoDoRecebivel {
  let total = 0;
  let pago = 0;
  let vencido = 0;
  let pagas = 0;

  for (const p of parcelas) {
    const cent = emCentavos(p.amount);
    total += cent;

    const situacao = situacaoDaParcela(p, hoje);
    if (situacao === "paga") {
      pago += cent;
      pagas += 1;
    } else if (situacao === "vencida") {
      vencido += cent;
    }
  }

  return {
    total: emMoeda(total),
    pago: emMoeda(pago),
    aberto: emMoeda(total - pago),
    vencido: emMoeda(vencido),
    parcelas: parcelas.length,
    pagas,
  };
}

/**
 * O que entrou num mês, em reais.
 *
 * Regime de caixa: conta pela data do pagamento, não pela da cobrança. O app
 * antigo tinha as duas contas convivendo — o painel somava o valor combinado
 * por data de cadastro, o financeiro somava parcela paga por data de
 * pagamento — e os dois números nunca batiam.
 *
 * Parcela em dólar sem cotação **não entra na soma** e é contada à parte: é
 * melhor a tela dizer "uma parcela sem cotação" do que somar mil dólares
 * como se fossem mil reais.
 */
export function recebidoNoMes(
  parcelas: { amount: number; paid_on: string | null; paid_rate: number | null; currency: string }[],
  mes: string,
): { total: number; semCotacao: number } {
  let centavos = 0;
  let semCotacao = 0;

  for (const p of parcelas) {
    if (!p.paid_on || !p.paid_on.startsWith(mes)) continue;

    const reais = emReais(p.amount, p.currency, p.paid_rate);
    if (reais === null) semCotacao += 1;
    else centavos += emCentavos(reais);
  }

  return { total: emMoeda(centavos), semCotacao };
}
