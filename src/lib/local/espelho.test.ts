// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  marcaComRecuo,
  MARCA_DAS_LAPIDES,
  sincronizar,
  type Armazem,
  type Lapide,
  type Linha,
  type TransporteDoEspelho,
} from "./espelho";

/**
 * O motor do espelho offline, sem Dexie e sem rede.
 *
 * Cada teste aqui corresponde a um jeito conhecido de o aparelho mostrar
 * dado errado **sem dar erro nenhum** — que é o modo de falha desta
 * arquitetura:
 *
 * - linha que mudou e não foi buscada (relógio do banco fora de ordem);
 * - linha apagada no servidor que continua no aparelho;
 * - contagem que não bate depois de qualquer furo;
 * - lápide que expirou antes de o aparelho voltar.
 */

const TABELAS = ["tags", "document_types"] as const;

type Servidor = {
  linhas: Record<string, Linha[]>;
  lapides: Lapide[];
};

function novoServidor(): Servidor {
  return { linhas: { tags: [], document_types: [] }, lapides: [] };
}

/** Transporte falso: responde do `Servidor`, como o PostgREST responderia. */
function transporte(servidor: Servidor): TransporteDoEspelho {
  return {
    async mudancas(tabela, desde) {
      const linhas = servidor.linhas[tabela] ?? [];
      const filtradas = desde
        ? linhas.filter((l) => String(l.updated_at) >= desde)
        : linhas;
      return [...filtradas].sort((a, b) =>
        String(a.updated_at).localeCompare(String(b.updated_at)),
      );
    },
    async tudo(tabela) {
      return [...(servidor.linhas[tabela] ?? [])];
    },
    async lapides(desde) {
      return servidor.lapides.filter((l) => !desde || l.deleted_at >= desde);
    },
    async manifesto() {
      return [
        ...TABELAS.map((t) => ({
          tabela: t,
          linhas: (servidor.linhas[t] ?? []).length,
          maximo_updated_at: null,
        })),
        {
          tabela: "deleted_rows",
          linhas: servidor.lapides.length,
          // Horizonte: a lápide mais antiga guardada.
          maximo_updated_at:
            servidor.lapides.map((l) => l.deleted_at).sort()[0] ?? "1970-01-01T00:00:00Z",
        },
      ];
    },
  };
}

/** Armazém falso: o que o Dexie vai fazer, em memória. */
function armazem(): Armazem & { dados: Record<string, Map<string, Linha>> } {
  const dados: Record<string, Map<string, Linha>> = {};
  const marcas = new Map<string, string>();
  const tabela = (t: string) => (dados[t] ??= new Map());

  return {
    dados,
    async gravar(t, linhas) {
      // Neste armazém de teste a chave é o `id`; `person_tags`, que não tem
      // um, não entra em nenhum destes testes.
      for (const l of linhas) tabela(t).set(String(l.id), l);
    },
    async apagar(t, ids) {
      for (const id of ids) tabela(t).delete(id);
    },
    async substituir(t, linhas) {
      dados[t] = new Map(linhas.map((l) => [String(l.id), l]));
    },
    async contar(t) {
      return tabela(t).size;
    },
    async marca(t) {
      return marcas.get(t) ?? null;
    },
    async definirMarca(t, marca) {
      if (marca) marcas.set(t, marca);
    },
  };
}

const linha = (id: string, updated_at: string, extra: Record<string, unknown> = {}): Linha => ({
  id,
  organization_id: "org",
  updated_at,
  ...extra,
});

describe("marcaComRecuo", () => {
  it("volta cinco segundos", () => {
    // Duas transações sobrepostas podem gravar fora de ordem de relógio: a
    // que commita depois fica com `updated_at` menor. Sem o recuo, a marca
    // d'água passa por cima dela e a linha **nunca mais** é buscada.
    expect(marcaComRecuo("2026-09-21T12:00:10.000Z")).toBe("2026-09-21T12:00:05.000Z");
  });

  it("sem marca, busca tudo", () => {
    expect(marcaComRecuo(null)).toBeNull();
  });
});

describe("sincronizar", () => {
  let servidor: Servidor;
  let local: ReturnType<typeof armazem>;

  beforeEach(() => {
    servidor = novoServidor();
    local = armazem();
  });

  const rodar = () => sincronizar(transporte(servidor), local, [...TABELAS]);

  it("traz o que existe na primeira vez", async () => {
    servidor.linhas.tags = [linha("t1", "2026-09-21T10:00:00Z", { name: "EB-1" })];

    await rodar();

    expect([...local.dados.tags.values()]).toEqual([
      linha("t1", "2026-09-21T10:00:00Z", { name: "EB-1" }),
    ]);
  });

  it("na segunda vez pede só o que mudou depois", async () => {
    servidor.linhas.tags = [linha("t1", "2026-09-21T10:00:00Z")];
    await rodar();

    const t = transporte(servidor);
    const espiao = vi.spyOn(t, "mudancas");
    servidor.linhas.tags.push(linha("t2", "2026-09-21T11:00:00Z"));
    await sincronizar(t, local, [...TABELAS]);

    // Com o recuo de 5 s: 09:59:55, não 10:00:00.
    expect(espiao).toHaveBeenCalledWith("tags", "2026-09-21T09:59:55.000Z", expect.anything());
    expect(local.dados.tags.size).toBe(2);
  });

  it("linha alterada substitui a antiga, não duplica", async () => {
    servidor.linhas.tags = [linha("t1", "2026-09-21T10:00:00Z", { name: "Antes" })];
    await rodar();

    servidor.linhas.tags = [linha("t1", "2026-09-21T11:00:00Z", { name: "Depois" })];
    await rodar();

    expect(local.dados.tags.size).toBe(1);
    expect(local.dados.tags.get("t1")!.name).toBe("Depois");
  });

  it("o que foi apagado no servidor sai do aparelho", async () => {
    // Sem isto, a pasta apagada no escritório fica para sempre na tela de
    // quem está viajando — exibida como se existisse.
    servidor.linhas.tags = [linha("t1", "2026-09-21T10:00:00Z")];
    await rodar();

    servidor.linhas.tags = [];
    servidor.lapides.push({ tabela: "tags", id: "t1", deleted_at: "2026-09-21T11:00:00Z" });
    await rodar();

    expect(local.dados.tags.size).toBe(0);
  });

  it("contagem diferente da do servidor manda recarregar a tabela", async () => {
    servidor.linhas.tags = [linha("t1", "2026-09-21T10:00:00Z")];
    await rodar();

    // Some uma linha do servidor sem lápide (lápide expirada, acesso
    // revogado, furo de marca d'água). A conta não bate: recarrega.
    servidor.linhas.tags = [];
    const resultado = await rodar();

    expect(resultado.recarregadas).toEqual(["tags"]);
    expect(local.dados.tags.size).toBe(0);
  });

  it("aparelho parado além do horizonte das lápides recarrega tudo", async () => {
    servidor.linhas.tags = [linha("t1", "2026-01-01T10:00:00Z")];
    await rodar();

    // Este aparelho não sincroniza desde janeiro, e o servidor já limpou as
    // lápides de então: a mais velha que ele ainda guarda é de setembro.
    // Tudo que foi apagado no meio sumiu sem deixar rastro — nenhuma conta
    // salva isso, só recarregar.
    await local.definirMarca(MARCA_DAS_LAPIDES, "2026-01-02T00:00:00Z");
    servidor.lapides.push({
      tabela: "document_types",
      id: "d9",
      deleted_at: "2026-09-01T00:00:00Z",
    });

    const resultado = await rodar();
    expect(resultado.recarregadas.sort()).toEqual(["document_types", "tags"]);
  });

  it("falha de rede não estraga o que já está guardado", async () => {
    servidor.linhas.tags = [linha("t1", "2026-09-21T10:00:00Z")];
    await rodar();

    const quebrado: TransporteDoEspelho = {
      ...transporte(servidor),
      mudancas: async () => {
        throw new Error("Failed to fetch");
      },
    };

    const resultado = await sincronizar(quebrado, local, [...TABELAS]);

    expect(resultado.error).toContain("Failed to fetch");
    expect(local.dados.tags.size).toBe(1);
  });

  it("devolve quando o servidor respondeu, para a tela mostrar", async () => {
    const antes = Date.now();
    const resultado = await rodar();
    expect(new Date(resultado.em).getTime()).toBeGreaterThanOrEqual(antes);
    expect(resultado.error).toBeNull();
  });
});
