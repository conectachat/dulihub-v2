import { limparNome } from "@/lib/arquivos";
import { venceu } from "@/lib/prazos";
import { emCentavos, emMoeda } from "@/lib/totals";

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

type ParaSituacao = { due_on: string; paid_on: string | null };

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
  return venceu(parcela.due_on, hoje) ? "vencida" : "pendente";
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

export type TotaisDaMoeda = {
  contratado: number;
  pago: number;
  saldo: number;
  vencido: number;
};

/**
 * Os totais de um cliente, **por moeda**: contratado, pago, saldo devedor e
 * vencido (CLI-5).
 *
 * Cada cobrança passa por `resumoDoRecebivel` e as moedas somam em centavos,
 * cada uma na sua. `somarPorMoeda` (`lib/totals.ts`) não serve aqui: soma em
 * ponto flutuante e pula o zero, e a moeda de uma cobrança toda paga sumiria
 * do quadro.
 *
 * A chave é a moeda como o banco a guarda (`BRL`, `USD`): uma moeda nova no
 * banco aparece sozinha, em vez de ser descartada por um tipo fechado.
 */
export function totaisPorMoeda(
  cobrancas: { currency: string; parcelas: (ParaSituacao & { amount: number })[] }[],
  hoje: string,
): Record<string, TotaisDaMoeda> {
  const centavos: Record<string, TotaisDaMoeda> = {};

  for (const c of cobrancas) {
    const r = resumoDoRecebivel(c.parcelas, hoje);
    const soma = (centavos[c.currency] ??= { contratado: 0, pago: 0, saldo: 0, vencido: 0 });
    soma.contratado += emCentavos(r.total);
    soma.pago += emCentavos(r.pago);
    soma.saldo += emCentavos(r.aberto);
    soma.vencido += emCentavos(r.vencido);
  }

  return Object.fromEntries(
    Object.entries(centavos).map(([moeda, t]) => [
      moeda,
      {
        contratado: emMoeda(t.contratado),
        pago: emMoeda(t.pago),
        saldo: emMoeda(t.saldo),
        vencido: emMoeda(t.vencido),
      },
    ]),
  );
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

/**
 * Onde o anexo da parcela mora no depósito `financeiro` (CLI-6): organização
 * (é por ela que o depósito decide quem lê), pessoa (a anonimização apaga a
 * pasta dela de uma vez), cobrança, parcela, o id da linha e o nome limpo.
 * O banco confere as seis partes contra a parcela de verdade (0048).
 */
export function caminhoDoAnexo({
  organizacao,
  pessoa,
  cobranca,
  parcela,
  id,
  nome,
}: {
  organizacao: string;
  pessoa: string;
  cobranca: string;
  parcela: string;
  id: string;
  nome: string;
}): string {
  return `${organizacao}/${pessoa}/${cobranca}/${parcela}/${id}/${limparNome(nome)}`;
}
