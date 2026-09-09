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
  /**
   * Os nós abaixo deste, em qualquer profundidade.
   *
   * São ids e não uma contagem porque o aviso de exclusão precisa saber
   * **quais** — a chave estrangeira tem cascade, então apagar um nó tira
   * também o que os filhos dele carregavam em outras tabelas, e só dá para
   * dizer isso cruzando os ids. Para a contagem, `.length`.
   */
  descendantIds: string[];
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

  /** `visitados` corta ciclo: sem ele a coleta recorre para sempre. */
  const coletarDescendentes = (
    id: string,
    visitados: Set<string>,
  ): string[] => {
    if (visitados.has(id)) return [];
    visitados.add(id);
    return (byParent.get(id) ?? []).flatMap((filho) => [
      filho.id,
      ...coletarDescendentes(filho.id, visitados),
    ]);
  };

  const out: Flattened<T>[] = [];
  const emitidos = new Set<string>();

  const walk = (irmaos: T[], depth: number) => {
    irmaos.forEach((node, index) => {
      if (emitidos.has(node.id)) return;
      emitidos.add(node.id);

      out.push({
        ...node,
        depth,
        isFirst: index === 0,
        isLast: index === irmaos.length - 1,
        descendantIds: coletarDescendentes(node.id, new Set()),
      });

      walk(byParent.get(node.id) ?? [], depth + 1);
    });
  };

  walk(byParent.get(null) ?? [], 0);

  /**
   * Nada some.
   *
   * Um nó cujo pai não está no conjunto — pai apagado, consulta filtrada,
   * seleção parcial — ou um preso em ciclo nunca é alcançado a partir da raiz.
   * Deixá-lo de fora é o pior desfecho possível: a linha existe no banco e não
   * há tela que a alcance para corrigir ou excluir. Então ele aparece na raiz,
   * onde dá para mexer nele.
   *
   * A ordem entre esses é a que veio do banco: qualquer critério aqui seria
   * inventado, e este é um caso de conserto, não de leitura corrente.
   */
  const soltos = nodes.filter((node) => !emitidos.has(node.id));
  soltos.forEach((node, index) => {
    emitidos.add(node.id);
    out.push({
      ...node,
      depth: 0,
      isFirst: index === 0,
      isLast: index === soltos.length - 1,
      descendantIds: coletarDescendentes(node.id, new Set()),
    });
  });

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
