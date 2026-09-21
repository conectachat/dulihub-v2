import type { Linha } from "./espelho";
import type { ItemDaFila } from "./fila";

/**
 * O que a tela mostra = o espelho **mais** o que ainda não subiu.
 *
 * A linha gravada offline não entra na tabela espelhada, e isso é o centro do
 * desenho. O espelho é a cópia do que o servidor devolveu — nada mais. Se uma
 * criação local entrasse ali, a conferência do manifesto (`espelho.ts`) veria
 * a contagem local maior que a do servidor, recarregaria a tabela e **apagaria
 * a criação pendente**. Com um item parado em conflito, isso viraria
 * permanente: a linha pisca e some a cada minuto.
 *
 * Então o pendente vive só na fila, e a leitura o põe por cima — aqui, numa
 * função pura. Consequência boa: o pull não precisa saber de nada disso, e a
 * ordem entre sincronizar e gravar deixa de ser um problema de corrida.
 */

export type Pendencia = {
  /** Feita neste aparelho e ainda não confirmada pelo servidor. */
  pendente?: boolean;
  /** Recusada pelo servidor, com o motivo — some só quando alguém decidir. */
  conflito?: string | null;
};

export type LinhaLocal = Linha & Pendencia;

const REORDENAR = "reordenar_irmaos";

export function sobrepor(
  tabela: string,
  linhas: Linha[],
  itens: ItemDaFila[],
): LinhaLocal[] {
  if (itens.length === 0) return linhas as LinhaLocal[];

  const porId = new Map<string, LinhaLocal>(
    linhas.map((l) => [String(l.id), { ...l } as LinhaLocal]),
  );
  // A ordem importa: criar e depois renomear tem de terminar com o nome novo.
  const ordenados = [...itens].sort((a, b) => a.criada_em.localeCompare(b.criada_em));

  for (const item of ordenados) {
    const marca: Pendencia = {
      pendente: true,
      conflito: item.estado === "conflito" ? item.motivo : null,
    };

    for (const passo of item.passos) {
      if (passo.tipo === "rpc") {
        if (passo.nome !== REORDENAR || passo.args.p_tabela !== tabela) continue;
        const ids = (passo.args.p_ids as string[]) ?? [];
        ids.forEach((id, ordem) => {
          const linha = porId.get(id);
          if (linha) porId.set(id, { ...linha, position: ordem, ...marca });
        });
        continue;
      }

      if (passo.tabela !== tabela) continue;

      if (passo.tipo === "insert") {
        porId.set(String(passo.linha.id), { ...passo.linha, ...marca });
      } else if (passo.tipo === "update") {
        const linha = porId.get(passo.id);
        // Linha que não está aqui: apagada por outra pessoa, ou nunca vista
        // por este aparelho. Inventá-la seria mostrar dado que não existe.
        if (linha) porId.set(passo.id, { ...linha, ...passo.patch, ...marca });
      } else {
        porId.delete(passo.id);
      }
    }
  }

  return [...porId.values()];
}
