/**
 * Lê valor em dinheiro digitado à mão.
 *
 * Existia em duas cópias, com o mesmo defeito e o mesmo comentário por cima
 * prometendo o contrário: tiravam **todos** os pontos e trocavam a vírgula por
 * ponto. Isso lê `12.500,00` certo e transforma `2000.00` em `200000` — cem
 * vezes o valor, gravado em silêncio num campo que vira contrato e cobrança.
 *
 * A regra aqui é a que as pessoas usam de verdade: **manda o último
 * separador.** Se o último for vírgula, os pontos são de milhar; se for ponto,
 * as vírgulas é que são. Havendo um separador só, três casas depois dele
 * indicam milhar — `1.500` é mil e quinhentos, `1.50` é um e cinquenta.
 *
 * Devolve `null` para vazio ou lixo, e `0` para zero. Distinguir os dois
 * importa: preço zero é cortesia, preço nulo é "ainda não definido".
 */
export function parseMoney(entrada: string | null | undefined): number | null {
  if (typeof entrada !== "string") return null;

  // Símbolo de moeda, espaço e qualquer outro enfeite saem; sobram dígitos,
  // separadores e o sinal.
  const limpo = entrada.replace(/[^\d.,-]/g, "").trim();
  if (!limpo || !/\d/.test(limpo)) return null;

  const negativo = limpo.startsWith("-");
  const semSinal = limpo.replace(/-/g, "");

  const ultimoPonto = semSinal.lastIndexOf(".");
  const ultimaVirgula = semSinal.lastIndexOf(",");

  let decimal: string;

  if (ultimoPonto >= 0 && ultimaVirgula >= 0) {
    // Os dois presentes: o que vem por último separa os centavos.
    decimal = ultimoPonto > ultimaVirgula ? "." : ",";
  } else if (ultimoPonto >= 0 || ultimaVirgula >= 0) {
    const separador = ultimoPonto >= 0 ? "." : ",";
    const posicao = Math.max(ultimoPonto, ultimaVirgula);
    const casasDepois = semSinal.length - posicao - 1;
    const apareceUmaVez =
      semSinal.split(separador).length === 2;

    // "1.500" é milhar; "1.50" é decimal. Separador repetido é sempre milhar.
    decimal = apareceUmaVez && casasDepois !== 3 ? separador : "";
  } else {
    decimal = "";
  }

  const semMilhar = decimal
    ? semSinal.split(decimal === "." ? "," : ".").join("")
    : semSinal.replace(/[.,]/g, "");

  const normalizado = decimal ? semMilhar.replace(decimal, ".") : semMilhar;

  const n = Number(normalizado);
  if (!Number.isFinite(n)) return null;

  return negativo ? -n : n;
}

/**
 * Lê inteiro não-negativo digitado à mão: prazo em dias, contagem, ordem.
 *
 * Existe porque `Number(v) || null` está em quatro lugares no projeto e
 * **transforma zero em nulo** — que é errado onde zero significa alguma coisa.
 * Prazo de zero dia é "no mesmo dia", não "sem prazo definido".
 */
export function parseWholeNumber(
  entrada: string | null | undefined,
): number | null {
  if (typeof entrada !== "string") return null;

  const limpo = entrada.trim();
  if (!limpo || !/^\d+$/.test(limpo)) return null;

  const n = Number(limpo);
  return Number.isSafeInteger(n) ? n : null;
}
