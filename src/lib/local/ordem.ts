import type { ItemDaFila } from "./fila";

/**
 * Reordenar de um jeito que aguenta ser repetido.
 *
 * `swap_positions` (0014) troca duas linhas de lugar. Repetir a mesma troca
 * **desfaz**, e duas trocas reproduzidas fora de ordem deixam a lista errada
 * **sem erro nenhum** — o pior tipo de defeito desta arquitetura, e o que
 * aconteceria numa fila que sobe depois de horas offline. `reordenar_irmaos`
 * (0030) recebe a ordem final inteira: repetir não muda nada.
 *
 * Nas telas do processo (`features/projects/*`) `swap_positions` continua,
 * porque elas ainda gravam pelo servidor. Quando migrarem, vêm para cá.
 */

export const RPC_ORDEM = "reordenar_irmaos";

/** O identificador do grupo de irmãos, para coalescer e para o bloqueio. */
export function alvoDaOrdem(tabela: string, pai: string | null): string {
  return `reordenar:${tabela}:${pai ?? "raiz"}`;
}

/** A lista de irmãos na ordem final depois de mover um deles. */
export function novaOrdem<T extends { id: string }>(
  irmaos: T[],
  id: string,
  direcao: "up" | "down",
): string[] {
  const ids = irmaos.map((i) => i.id);
  const atual = ids.indexOf(id);
  const destino = direcao === "up" ? atual - 1 : atual + 1;

  // Fora da lista, ou já na ponta: a ordem final é a atual. Não é erro —
  // a tela desabilita as setas, e recusar aqui só produziria aviso à toa.
  if (atual < 0 || destino < 0 || destino >= ids.length) return ids;

  [ids[atual], ids[destino]] = [ids[destino], ids[atual]];
  return ids;
}

/**
 * Já existe uma reordenação pendente deste mesmo grupo? Devolve o id dela.
 *
 * Quem grava substitui aquele item em vez de empilhar outro: dez cliques
 * offline viram uma chamada só, com a ordem final. Empilhar dez seria mandar
 * nove ordens que já não valem.
 *
 * Reordenação **recusada** não é substituída: ela espera alguém decidir na
 * bandeja, e apagá-la por baixo seria desfazer calado.
 */
export function coalescerOrdem(
  itens: ItemDaFila[],
  tabela: string,
  pai: string | null,
): string | null {
  const alvo = alvoDaOrdem(tabela, pai);

  const igual = itens.find(
    (i) =>
      i.estado === "pendente" &&
      i.alvo === alvo &&
      i.passos.some((p) => p.tipo === "rpc" && p.nome === RPC_ORDEM),
  );

  return igual?.id ?? null;
}
