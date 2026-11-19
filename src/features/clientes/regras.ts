/**
 * Regras da tela de Clientes — puras, testadas em `regras.test.ts`.
 */

import { limparNome } from "@/lib/arquivos";

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
