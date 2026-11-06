// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";

import {
  drenar,
  mesmaVersao,
  type ArmazemDaFila,
  type ItemDaFila,
  type Operacao,
  type TransporteDaFila,
} from "./fila";

/**
 * A fila de gravações, sem rede e sem Dexie.
 *
 * Cada teste aqui é um jeito conhecido de uma gravação feita offline sumir
 * **sem erro nenhum** — que é o modo de falha desta parte:
 *
 * - a resposta do servidor se perde e o replay duplica, ou apaga duas vezes;
 * - a RLS recusa e a fila limpa o item como se tivesse subido;
 * - um item depende de outro que foi recusado, e o dependente "dá certo"
 *   contra uma linha que nunca existiu;
 * - a rede cai no meio e a ordem se embaralha.
 */

type Chamada = { tipo: string; tabela?: string; id?: string };

type Falha = { code?: string; message?: string; status?: number };

/**
 * A queda de rede **como o supabase-js a entrega** em POST, PATCH e DELETE:
 * não como exceção, mas como resposta, com `status` 0 e `code` vazio. Era
 * assim que ela passava por recusa do servidor (G6).
 */
const QUEDA: Falha = { code: "", message: "TypeError: Failed to fetch", status: 0 };

function transporte(config: {
  /** Erro por chamada, na ordem; nulo deixa passar. */
  erros?: (Falha | "rede" | null)[];
  /** Quantas linhas cada update/delete tocou, na ordem. */
  linhas?: number[];
  existe?: boolean;
  /** Erro da pergunta "a linha ainda está lá?". */
  erroDoExiste?: Falha;
  /** Roda no meio de cada chamada — para encenar um clique durante o envio. */
  durante?: () => Promise<void> | void;
}): TransporteDaFila & { chamadas: Chamada[] } {
  const chamadas: Chamada[] = [];
  let i = 0;
  let j = 0;

  const proximo = () => {
    const erro = config.erros?.[i++] ?? null;
    if (erro === "rede") throw new Error("Failed to fetch");
    return erro;
  };
  const tocadas = () => config.linhas?.[j++] ?? 1;

  return {
    chamadas,
    async inserir(tabela, linha) {
      chamadas.push({ tipo: "inserir", tabela, id: String(linha.id) });
      return { error: proximo() };
    },
    async atualizar(tabela, id) {
      chamadas.push({ tipo: "atualizar", tabela, id });
      const error = proximo();
      return { error, linhas: error ? 0 : tocadas() };
    },
    async apagar(tabela, id) {
      chamadas.push({ tipo: "apagar", tabela, id });
      const error = proximo();
      return { error, linhas: error ? 0 : tocadas() };
    },
    async existe(tabela, id) {
      chamadas.push({ tipo: "existe", tabela, id });
      return { existe: config.existe ?? false, error: config.erroDoExiste ?? null };
    },
    async rpc(nome) {
      chamadas.push({ tipo: "rpc", tabela: nome });
      await config.durante?.();
      return { error: proximo() };
    },
  };
}

function armazem(itens: ItemDaFila[]): ArmazemDaFila & { itens: ItemDaFila[] } {
  return {
    itens,
    async listar() {
      return [...itens].sort((a, b) => a.criada_em.localeCompare(b.criada_em));
    },
    async gravar(item) {
      const i = itens.findIndex((x) => x.id === item.id);
      if (i >= 0) itens[i] = item;
      else itens.push(item);
    },
    async apagar(id) {
      const i = itens.findIndex((x) => x.id === id);
      if (i >= 0) itens.splice(i, 1);
    },
    async apagarSeIgual(item) {
      const i = itens.findIndex((x) => x.id === item.id);
      if (i >= 0 && mesmaVersao(itens[i], item)) itens.splice(i, 1);
    },
    async gravarSeIgual(anterior, novo) {
      const i = itens.findIndex((x) => x.id === anterior.id);
      if (i >= 0 && mesmaVersao(itens[i], anterior)) itens[i] = novo;
    },
  };
}

let relogio = 0;

function item(
  id: string,
  passos: Operacao[],
  extra: Partial<ItemDaFila> = {},
): ItemDaFila {
  relogio += 1;
  return {
    id,
    alvo: id,
    depende: [],
    passos,
    rotulo: `item ${id}`,
    criada_em: `2026-09-21T10:00:${String(relogio).padStart(2, "0")}Z`,
    estado: "pendente",
    enviada_em: null,
    motivo: null,
    ...extra,
  };
}

const REPETIDA = 'duplicate key value violates unique constraint "tags_pkey"';
const NOME_REPETIDO =
  'duplicate key value violates unique constraint "tags_org_name_unique"';

beforeEach(() => {
  relogio = 0;
});

describe("drenar", () => {
  it("sobe na ordem em que foi feito", async () => {
    const fila = armazem([
      item("a", [{ tipo: "insert", tabela: "tags", linha: { id: "t1", name: "A" } }]),
      item("b", [{ tipo: "update", tabela: "tags", id: "t1", patch: { name: "B" } }]),
    ]);
    const rede = transporte({});

    const resultado = await drenar(rede, fila);

    expect(rede.chamadas.map((c) => c.tipo)).toEqual(["inserir", "atualizar"]);
    expect(resultado.subiram).toBe(2);
    expect(fila.itens).toEqual([]);
  });

  it("resposta perdida: repetir o mesmo insert não duplica nem trava a fila", async () => {
    // O id vem do cliente. Se a aba morreu entre o envio e a resposta, o
    // replay bate na chave primária — sinal de que já subiu, não de erro.
    const fila = armazem([
      item("a", [{ tipo: "insert", tabela: "tags", linha: { id: "t1", name: "A" } }]),
    ]);
    const rede = transporte({ erros: [{ code: "23505", message: REPETIDA }] });

    const resultado = await drenar(rede, fila);

    expect(resultado.subiram).toBe(1);
    expect(resultado.conflitos).toBe(0);
    expect(fila.itens).toEqual([]);
  });

  it("marcar de novo o que já está marcado não é erro, quando a operação diz", async () => {
    // `visa_type_documents` tem unique próprio. Marcar duas vezes a mesma
    // pasta é intenção repetida — mas só onde a operação declara isso.
    const fila = armazem([
      item("a", [
        {
          tipo: "insert",
          tabela: "visa_type_documents",
          linha: { id: "v1" },
          seJaExistir: "ok",
        },
      ]),
    ]);
    const rede = transporte({ erros: [{ code: "23505", message: NOME_REPETIDO }] });

    const resultado = await drenar(rede, fila);

    expect(resultado.subiram).toBe(1);
    expect(resultado.conflitos).toBe(0);
  });

  it("nome repetido é conflito de verdade, com a frase de quem usa", async () => {
    const fila = armazem([
      item("a", [{ tipo: "insert", tabela: "tags", linha: { id: "t1", name: "A" } }]),
    ]);
    const rede = transporte({ erros: [{ code: "23505", message: NOME_REPETIDO }] });

    const resultado = await drenar(rede, fila);

    expect(resultado.conflitos).toBe(1);
    expect(fila.itens[0].estado).toBe("conflito");
    expect(fila.itens[0].motivo).toBe("Já existe uma tag com esse nome.");
  });

  it("recusa da RLS vira conflito visível — nunca some calado", async () => {
    const fila = armazem([
      item("a", [{ tipo: "update", tabela: "tags", id: "t1", patch: { name: "B" } }]),
    ]);
    const rede = transporte({ erros: [{ code: "42501" }] });

    await drenar(rede, fila);

    expect(fila.itens[0].estado).toBe("conflito");
    expect(fila.itens[0].motivo).toBe("Você não tem permissão para isto.");
  });

  it("update que não tocou linha nenhuma é recusa, não sucesso", async () => {
    // PostgREST aplica a RLS como filtro: erro nulo e zero linhas.
    const fila = armazem([
      item("a", [{ tipo: "update", tabela: "tags", id: "t1", patch: { name: "B" } }]),
    ]);
    const rede = transporte({ linhas: [0] });

    await drenar(rede, fila);

    expect(fila.itens[0].estado).toBe("conflito");
    expect(fila.itens[0].motivo).toMatch(/Nada foi alterado/);
  });

  it("delete sem linha pergunta antes de decidir: sumiu é sucesso", async () => {
    const fila = armazem([item("a", [{ tipo: "delete", tabela: "tags", id: "t1" }])]);
    const rede = transporte({ linhas: [0], existe: false });

    const resultado = await drenar(rede, fila);

    expect(rede.chamadas.map((c) => c.tipo)).toEqual(["apagar", "existe"]);
    expect(resultado.subiram).toBe(1);
    expect(fila.itens).toEqual([]);
  });

  it("delete sem linha, mas a linha está lá: é a RLS recusando", async () => {
    const fila = armazem([item("a", [{ tipo: "delete", tabela: "tags", id: "t1" }])]);
    const rede = transporte({ linhas: [0], existe: true });

    await drenar(rede, fila);

    expect(fila.itens[0].estado).toBe("conflito");
  });

  it("rede cai no meio: a fila para inteira e a ordem se mantém", async () => {
    const fila = armazem([
      item("a", [{ tipo: "insert", tabela: "tags", linha: { id: "t1" } }]),
      item("b", [{ tipo: "insert", tabela: "tags", linha: { id: "t2" } }]),
      item("c", [{ tipo: "insert", tabela: "tags", linha: { id: "t3" } }]),
    ]);
    const rede = transporte({ erros: [null, "rede"] });

    const resultado = await drenar(rede, fila);

    expect(resultado.subiram).toBe(1);
    expect(resultado.conflitos).toBe(0);
    expect(resultado.parou).toBeTruthy();
    expect(fila.itens.map((i) => i.id)).toEqual(["b", "c"]);
    expect(fila.itens.every((i) => i.estado === "pendente")).toBe(true);
  });

  describe("queda de rede que chega como resposta (G6)", () => {
    const casos: [string, Operacao][] = [
      ["insert", { tipo: "insert", tabela: "tags", linha: { id: "t1" } }],
      ["update", { tipo: "update", tabela: "tags", id: "t1", patch: { name: "x" } }],
      ["delete", { tipo: "delete", tabela: "tags", id: "t1" }],
      ["rpc", { tipo: "rpc", nome: "reordenar_irmaos", args: {} }],
    ];

    it.each(casos)("%s: não vira conflito; a fila para e espera", async (_nome, passo) => {
      const fila = armazem([item("a", [passo]), item("b", [passo])]);

      const resultado = await drenar(transporte({ erros: [QUEDA] }), fila);

      expect(resultado.conflitos).toBe(0);
      expect(resultado.parou).toMatch(/sem conexão/i);
      expect(fila.itens.map((i) => i.estado)).toEqual(["pendente", "pendente"]);
    });

    it("servidor fora do ar (5xx) e limite de pedidos (429) também esperam", async () => {
      for (const falha of [
        { code: "", message: "Bad Gateway", status: 502 },
        { code: "", message: "Too Many Requests", status: 429 },
      ]) {
        const fila = armazem([item("a", [{ tipo: "insert", tabela: "tags", linha: { id: "t1" } }])]);
        const resultado = await drenar(transporte({ erros: [falha] }), fila);
        expect(resultado.parou).toBeTruthy();
        expect(fila.itens[0].estado).toBe("pendente");
      }
    });

    it("delete sem linha e sem rede para perguntar: espera, não declara sucesso", async () => {
      // Antes, a pergunta que falhava respondia "não existe", e o delete era
      // dado como feito sem o servidor ter visto nada.
      const fila = armazem([item("a", [{ tipo: "delete", tabela: "tags", id: "t1" }])]);
      const rede = transporte({ linhas: [0], erroDoExiste: QUEDA });

      const resultado = await drenar(rede, fila);

      expect(resultado.subiram).toBe(0);
      expect(resultado.parou).toBeTruthy();
      expect(fila.itens[0].estado).toBe("pendente");
    });
  });

  describe("item substituído enquanto sobe (G7)", () => {
    // Dois cliques rápidos em reordenar: o segundo substitui o primeiro na
    // fila, com o mesmo id, enquanto o primeiro ainda está subindo. Apagar
    // "pelo id" ao terminar levava junto a versão nova, e a linha pulava de
    // volta para a ordem do primeiro clique.
    const ordem = (irmaos: string[]): Operacao => ({
      tipo: "rpc",
      nome: "reordenar_irmaos",
      args: { p_ids: irmaos },
    });

    it("a versão nova continua na fila, e sobe na rodada seguinte", async () => {
      const primeira = item("r", [ordem(["b", "a", "c"])], { alvo: "reordenar:tags:raiz" });
      const fila = armazem([primeira]);
      const segunda = item("r", [ordem(["b", "c", "a"])], { alvo: "reordenar:tags:raiz" });

      const rede = transporte({
        durante: async () => {
          if (fila.itens[0] === primeira) await fila.gravar(segunda);
        },
      });

      await drenar(rede, fila);
      expect(fila.itens).toEqual([segunda]);

      await drenar(rede, fila);
      expect(fila.itens).toEqual([]);
      expect(rede.chamadas).toHaveLength(2);
    });

    it("recusa da versão velha não marca conflito na nova", async () => {
      const primeira = item("r", [ordem(["b", "a"])], { alvo: "reordenar:tags:raiz" });
      const fila = armazem([primeira]);
      const segunda = item("r", [ordem(["a", "b"])], { alvo: "reordenar:tags:raiz" });

      const rede = transporte({
        erros: [{ code: "42501", message: "recusado" }],
        durante: async () => {
          if (fila.itens[0] === primeira) await fila.gravar(segunda);
        },
      });

      await drenar(rede, fila);
      expect(fila.itens).toEqual([segunda]);
      expect(fila.itens[0].estado).toBe("pendente");
    });
  });

  it("sessão expirada espera — não é recusa, é hora errada", async () => {
    const fila = armazem([item("a", [{ tipo: "delete", tabela: "tags", id: "t1" }])]);
    const rede = transporte({ erros: [{ code: "PGRST301" }] });

    const resultado = await drenar(rede, fila);

    expect(resultado.parou).toBeTruthy();
    expect(fila.itens[0].estado).toBe("pendente");
  });

  it("quem depende de um item recusado não é enviado", async () => {
    // Sem isto, o delete de uma pasta que nunca chegou a existir acharia zero
    // linhas, seria declarado sucesso e limparia a fila: a pasta some da tela
    // e ninguém fica sabendo que ela nunca existiu.
    const fila = armazem([
      item("a", [{ tipo: "insert", tabela: "document_types", linha: { id: "d1" } }], {
        alvo: "d1",
      }),
      item("b", [{ tipo: "delete", tabela: "document_types", id: "d1" }], {
        alvo: "d1",
        depende: ["d1"],
      }),
      item("c", [{ tipo: "insert", tabela: "tags", linha: { id: "t9" } }], { alvo: "t9" }),
    ]);
    const rede = transporte({ erros: [{ code: "42501" }] });

    const resultado = await drenar(rede, fila);

    // A pasta e o delete dela ficam para a bandeja; a tag, que não tem nada a
    // ver com elas, sobe.
    expect(rede.chamadas.map((c) => c.id)).toEqual(["d1", "t9"]);
    expect(resultado.subiram).toBe(1);
    expect(fila.itens.find((i) => i.id === "b")!.estado).toBe("conflito");
    expect(fila.itens.find((i) => i.id === "b")!.motivo).toMatch(/depende/i);
  });

  it("conflito antigo continua segurando quem depende dele", async () => {
    const fila = armazem([
      item("a", [{ tipo: "insert", tabela: "document_types", linha: { id: "d1" } }], {
        alvo: "d1",
        estado: "conflito",
        motivo: "Você não tem permissão para isto.",
      }),
      item("b", [{ tipo: "update", tabela: "document_types", id: "d1", patch: { name: "x" } }], {
        alvo: "d1",
        depende: ["d1"],
      }),
    ]);
    const rede = transporte({});

    await drenar(rede, fila);

    expect(rede.chamadas).toEqual([]);
    expect(fila.itens.find((i) => i.id === "b")!.estado).toBe("conflito");
  });

  it("um item com vários passos só sai da fila com todos aplicados", async () => {
    // A cascata que o Postgres faz sozinho tem de ser escrita aqui: apagar a
    // pasta-mãe e as filhas é um item só.
    const fila = armazem([
      item(
        "a",
        [
          { tipo: "delete", tabela: "document_types", id: "filha" },
          { tipo: "delete", tabela: "document_types", id: "mae" },
        ],
        { alvo: "mae" },
      ),
    ]);
    const rede = transporte({ erros: [null, { code: "42501" }] });

    await drenar(rede, fila);

    expect(rede.chamadas.map((c) => c.id)).toEqual(["filha", "mae"]);
    expect(fila.itens[0].estado).toBe("conflito");
  });
});
