/**
 * Regras da tela de Clientes — puras, testadas em `regras.test.ts`.
 */

import { limparNome } from "@/lib/arquivos";

// ------------------------------------------------------------------- lista
//
// A lista mostra 50 por vez e diz sempre o total: o app antigo cortava em
// silêncio, e quem procurava o cliente 51 concluía que ele não existia (o M1).

export const POR_PAGINA = 50;

/** O `?pagina=` da URL; sem número inteiro positivo, a primeira. */
export function paginaPedida(valor: string | undefined): number {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * "30 clientes" quando tudo cabe na página; "Mostrando 51–72 de 72" quando
 * não cabe; nulo sem ninguém, porque aí a tela mostra a lista vazia.
 */
export function contagemDaLista({
  total,
  pagina,
  naPagina,
  porPagina = POR_PAGINA,
}: {
  total: number;
  pagina: number;
  naPagina: number;
  porPagina?: number;
}): string | null {
  if (total === 0) return null;
  if (naPagina === total) return total === 1 ? "1 cliente" : `${total} clientes`;

  const de = (pagina - 1) * porPagina + 1;
  return `Mostrando ${de}–${de + naPagina - 1} de ${total}`;
}

// -------------------------------------------------------------- documentos

/** As categorias de `files.category` (0047), na ordem em que a aba as mostra. */
export const CATEGORIAS = [
  { valor: "identidade", rotulo: "Identidade" },
  { valor: "passaporte", rotulo: "Passaporte" },
  { valor: "comprovante_residencia", rotulo: "Comprovante de residência" },
  { valor: "contrato", rotulo: "Contrato" },
  { valor: "outro", rotulo: "Outro" },
] as const;

export type Categoria = (typeof CATEGORIAS)[number]["valor"];

/**
 * Onde o documento mora no depósito `pessoas`: organização (é por ela que o
 * depósito decide quem lê), pessoa (a anonimização apaga a pasta de uma vez),
 * o id da linha (dois "passaporte.pdf" não se sobrepõem) e o nome limpo. O
 * banco confere as quatro partes contra a própria linha (0047).
 */
export function caminhoDoDocumento(
  organizacao: string,
  pessoa: string,
  id: string,
  nome: string,
): string {
  return `${organizacao}/${pessoa}/${id}/${limparNome(nome)}`;
}

/** Os documentos agrupados por categoria, na ordem de `CATEGORIAS`, só as que têm. */
export function documentosPorCategoria<T extends { category: string }>(
  documentos: T[],
): { categoria: Categoria; rotulo: string; documentos: T[] }[] {
  const conhecida = (c: string) => CATEGORIAS.some((x) => x.valor === c);

  return CATEGORIAS.map(({ valor, rotulo }) => ({
    categoria: valor,
    rotulo,
    documentos: documentos.filter((d) =>
      valor === "outro" ? d.category === "outro" || !conhecida(d.category) : d.category === valor,
    ),
  })).filter((g) => g.documentos.length > 0);
}
