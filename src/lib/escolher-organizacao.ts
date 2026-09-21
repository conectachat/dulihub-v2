/**
 * De qual organização é a ação que está acontecendo — a regra de desempate.
 *
 * Mora sozinha, e não em `organizacao.ts`, porque agora vale nos dois lados:
 * no servidor, dentro de `contextoAtual()`; e no navegador, quando a gravação
 * é feita offline e não há servidor a quem perguntar. `organizacao.ts` importa
 * o cliente de servidor, que não pode entrar no pacote do navegador.
 *
 * **A raiz manda.** Quem trabalha na Duli e também foi convidado por um
 * parceiro opera pela Duli — o contrário gravaria a operação da casa dentro do
 * parceiro. Sem raiz, a associação mais antiga, que é a organização de origem
 * da pessoa.
 *
 * Pura e sem efeito na lista recebida: a mesma lista alimenta o seletor de
 * organização na tela.
 */
export function escolherOrganizacao<
  T extends { created_at: string; organizations: { type: string } | null },
>(associacoes: T[]): T | null {
  if (associacoes.length === 0) return null;

  const raiz = associacoes.filter((a) => a.organizations?.type === "root");
  const candidatas = raiz.length > 0 ? raiz : associacoes;

  return [...candidatas].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  )[0];
}
