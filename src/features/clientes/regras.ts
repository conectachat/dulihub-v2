/**
 * Regras da tela de Clientes — puras, testadas em `regras.test.ts`.
 */

import { limparNome } from "@/lib/arquivos";
import { NOVO_PROCESSO_SEM_NEGOCIO } from "@/lib/pessoa";

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

/** O que a lista vazia de Clientes diz: a gestão também cria à mão (CLI-15). */
export function dicaDaListaVazia(daGestao: boolean): string {
  return daGestao
    ? "Um contato vira cliente quando o negócio dele é ganho, ou pelo Novo cliente."
    : "Um contato vira cliente quando o negócio dele é ganho.";
}

/**
 * O que o `?novo-processo=` do perfil abre: `novo` abre sem negócio (o Novo
 * cliente, CLI-15); o id de um negócio **deste** cliente abre com ele (o
 * atalho do CRM); qualquer outra coisa não abre.
 */
export function oQueAbrir(
  atalho: string | undefined,
  negocios: { id: string }[],
): { abrir: boolean; negocioInicial?: string } {
  if (atalho === NOVO_PROCESSO_SEM_NEGOCIO) return { abrir: true };
  if (atalho && negocios.some((n) => n.id === atalho)) return { abrir: true, negocioInicial: atalho };
  return { abrir: false };
}
