/**
 * Achatamento de árvore, compartilhado por catálogo de documentos, etapas de
 * visto e — em breve — etapas de processo.
 *
 * A interface desenha hierarquia por recuo, não por painéis aninhados: é mais
 * simples de ler e de construir, e o recuo já comunica o nível. Esta função
 * transforma a lista plana do banco na ordem de leitura, anotando o que a tela
 * precisa saber sobre cada nó.
 */

export type TreeNodeBase = {
  id: string;
  parent_id: string | null;
  position: number;
};

export type Flattened<T> = T & {
  /** Profundidade a partir da raiz, para calcular o recuo. */
  depth: number;
  /** Primeiro entre os irmãos — desabilita o botão de subir. */
  isFirst: boolean;
  /** Último entre os irmãos — desabilita o botão de descer. */
  isLast: boolean;
  /** Quantos nós existem abaixo deste. Usado no aviso de exclusão. */
  descendants: number;
};

export function flattenTree<T extends TreeNodeBase>(nodes: T[]): Flattened<T>[] {
  const byParent = new Map<string | null, T[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parent_id) ?? [];
    list.push(node);
    byParent.set(node.parent_id, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.position - b.position);
  }

  const countDescendants = (id: string): number =>
    (byParent.get(id) ?? []).reduce(
      (sum, child) => sum + 1 + countDescendants(child.id),
      0,
    );

  const out: Flattened<T>[] = [];

  const walk = (parentId: string | null, depth: number) => {
    const siblings = byParent.get(parentId) ?? [];
    siblings.forEach((node, index) => {
      out.push({
        ...node,
        depth,
        isFirst: index === 0,
        isLast: index === siblings.length - 1,
        descendants: countDescendants(node.id),
      });
      walk(node.id, depth + 1);
    });
  };

  walk(null, 0);
  return out;
}

/**
 * Recuo em rem por nível. Um só lugar define o passo da hierarquia.
 *
 * O teto de cinco não é estético: a partir daí o conteúdo da linha sai da tela
 * no celular. Níveis mais fundos continuam existindo, só param de recuar — a
 * ordem de leitura já diz onde cada um está.
 */
const MAX_INDENT_LEVEL = 5;

export function indentStyle(depth: number) {
  return { marginLeft: `${Math.min(depth, MAX_INDENT_LEVEL) * 1.5}rem` };
}
