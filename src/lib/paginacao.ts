/**
 * Listas paginadas — Clientes e CRM › Encerradas —, testadas em
 * `paginacao.test.ts`.
 *
 * Mostram 50 por vez e dizem sempre o total: o app antigo cortava em
 * silêncio, e quem procurava o item 51 concluía que ele não existia (o M1).
 */

export const POR_PAGINA = 50;

/** O `?pagina=` da URL; sem número inteiro positivo, a primeira. */
export function paginaPedida(valor: string | undefined): number {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export type Substantivo = { singular: string; plural: string };

/**
 * "30 clientes" quando tudo cabe na página; "Mostrando 51–72 de 72" quando
 * não cabe; nulo sem nada, porque aí a tela mostra a lista vazia.
 */
export function contagemDaLista({
  total,
  pagina,
  naPagina,
  substantivo,
  porPagina = POR_PAGINA,
}: {
  total: number;
  pagina: number;
  naPagina: number;
  substantivo: Substantivo;
  porPagina?: number;
}): string | null {
  if (total === 0) return null;
  if (naPagina === total) {
    return total === 1 ? `1 ${substantivo.singular}` : `${total} ${substantivo.plural}`;
  }

  const de = (pagina - 1) * porPagina + 1;
  return `Mostrando ${de}–${de + naPagina - 1} de ${total}`;
}
