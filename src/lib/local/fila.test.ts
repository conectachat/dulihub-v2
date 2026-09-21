// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";

import {
  drenar,
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

type Falha = { code?: string; message?: string };

function transporte(config: {
  /** Erro por chamada, na ordem; nulo deixa passar. */
  erros?: (Falha | "rede" | null)[];
  /** Quantas linhas cada update/delete tocou, na ordem. */
  linhas?: number[];
  existe?: boolean;
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
      return config.existe ?? false;
    },
    async rpc(nome) {
      chamadas.push({ tipo: "rpc", tabela: nome });
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
