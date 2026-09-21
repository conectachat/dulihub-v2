/**
 * O motor do espelho offline: traz do servidor o que mudou, tira o que foi
 * apagado, e se confere.
 *
 * Não conhece Dexie nem Supabase — recebe um `Transporte` e um `Armazem`,
 * como a `Sincronia` das Observações (`src/features/pages/sincronia.ts`).
 * É o que permite testar sem rede os casos que produzem o pior defeito desta
 * arquitetura: **dado velho exibido como atual, sem erro nenhum**.
 *
 * Três redes, nesta ordem:
 *
 * 1. **Recuo de 5 s na marca d'água.** `now()` é o início da transação: duas
 *    gravações sobrepostas podem commitar fora de ordem de relógio, e a que
 *    entra depois com carimbo menor seria pulada para sempre. Reaplicar
 *    linha já vista é barato; perder uma é permanente.
 * 2. **Lápides** (`deleted_rows`, migration 0029) — o que sumiu do servidor.
 * 3. **Manifesto** (`sync_manifesto`, 0030): se a contagem local não bate com
 *    a do servidor, recarrega a tabela. É o que cobre qualquer furo das duas
 *    anteriores, inclusive acesso revogado.
 */

export type Linha = { id: string } & Record<string, unknown>;

export type Lapide = { tabela: string; id: string; deleted_at: string };

export interface TransporteDoEspelho {
  /** Linhas com `updated_at >= desde`, em ordem. `desde` nulo traz tudo. */
  mudancas(tabela: string, desde: string | null, limite: number): Promise<Linha[]>;
  /** A tabela inteira, para recarga. */
  tudo(tabela: string): Promise<Linha[]>;
  lapides(desde: string | null): Promise<Lapide[]>;
  manifesto(): Promise<
    { tabela: string; linhas: number; maximo_updated_at: string | null }[]
  >;
}

export interface Armazem {
  gravar(tabela: string, linhas: Linha[]): Promise<void>;
  apagar(tabela: string, ids: string[]): Promise<void>;
  substituir(tabela: string, linhas: Linha[]): Promise<void>;
  contar(tabela: string): Promise<number>;
  marca(tabela: string): Promise<string | null>;
  definirMarca(tabela: string, marca: string | null): Promise<void>;
}

export type ResultadoDaSincronia = {
  /** Quando o servidor respondeu — é o carimbo que a tela mostra. */
  em: string;
  atualizadas: string[];
  recarregadas: string[];
  error: string | null;
};

const RECUO_MS = 5_000;
const PAGINA = 1_000;
/** Marca da tabela de lápides: uma só, para todas. */
export const MARCA_DAS_LAPIDES = "__lapides";

/** A marca d'água, cinco segundos para trás. */
export function marcaComRecuo(marca: string | null): string | null {
  if (!marca) return null;
  return new Date(new Date(marca).getTime() - RECUO_MS).toISOString();
}

export async function sincronizar(
  transporte: TransporteDoEspelho,
  armazem: Armazem,
  tabelas: string[],
): Promise<ResultadoDaSincronia> {
  const atualizadas: string[] = [];
  const recarregadas = new Set<string>();

  try {
    // 1. O que mudou desde a última vez, tabela por tabela.
    for (const tabela of tabelas) {
      const desde = marcaComRecuo(await armazem.marca(tabela));
      const linhas = await transporte.mudancas(tabela, desde, PAGINA);
      if (linhas.length === 0) continue;

      await armazem.gravar(tabela, linhas);
      await armazem.definirMarca(tabela, maiorCarimbo(linhas));
      atualizadas.push(tabela);
    }

    // 2. O que foi apagado.
    const desdeLapides = await armazem.marca(MARCA_DAS_LAPIDES);
    const lapides = await transporte.lapides(marcaComRecuo(desdeLapides));
    for (const tabela of tabelas) {
      const ids = lapides.filter((l) => l.tabela === tabela).map((l) => l.id);
      if (ids.length) await armazem.apagar(tabela, ids);
    }

    // 3. Conferência. Vem depois de propósito: ela precisa ver o estado
    //    final, não o do meio da sincronia.
    const manifesto = await transporte.manifesto();
    const horizonte = manifesto.find((m) => m.tabela === "deleted_rows")?.maximo_updated_at;

    // Parado mais tempo que a retenção das lápides: as que faltaram já
    // sumiram do servidor, e nenhuma conta salva isso — recarrega tudo.
    const cego = Boolean(desdeLapides && horizonte && desdeLapides < horizonte);

    for (const tabela of tabelas) {
      const noServidor = manifesto.find((m) => m.tabela === tabela)?.linhas;
      if (noServidor === undefined) continue;
      if (cego || (await armazem.contar(tabela)) !== noServidor) {
        await armazem.substituir(tabela, await transporte.tudo(tabela));
        recarregadas.add(tabela);
      }
    }

    const em = new Date().toISOString();
    await armazem.definirMarca(MARCA_DAS_LAPIDES, em);

    return { em, atualizadas, recarregadas: [...recarregadas], error: null };
  } catch (erro) {
    // Falhar no meio deixa o espelho como estava — nunca vazio. Meia
    // sincronia é pior que nenhuma: a tela mostraria lista incompleta como
    // se fosse a lista.
    return {
      em: new Date().toISOString(),
      atualizadas,
      recarregadas: [...recarregadas],
      error: erro instanceof Error ? erro.message : String(erro),
    };
  }
}

function maiorCarimbo(linhas: Linha[]): string | null {
  let maior: string | null = null;
  for (const l of linhas) {
    const c = typeof l.updated_at === "string" ? l.updated_at : null;
    if (c && (maior === null || c > maior)) maior = c;
  }
  return maior;
}
