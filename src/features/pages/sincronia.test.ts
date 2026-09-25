// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  deBase64,
  deBytea,
  paraBase64,
  paraBytea,
  Sincronia,
  type Deposito,
  type Pedaco,
  type Transporte,
} from "./sincronia";

/**
 * A sincronização das Observações, sem Supabase e sem editor.
 *
 * Um banco de mentira (lista de pedaços + snapshot) e um canal de mentira
 * (entrega às outras pontas quando o teste mandar). O que se exige é o que o
 * Renato vai perceber se falhar: duas pessoas escrevendo juntas terminam com
 * o mesmo texto, e nada escrito some — nem com mensagem atrasada, repetida,
 * fora de ordem, ou com o banco recusando uma gravação.
 */

type Banco = { snapshot: Uint8Array | null; pedacos: Pedaco[]; proximo: number };

function novoBanco(): Banco {
  return { snapshot: null, pedacos: [], proximo: 1 };
}

/** Canal que segura as mensagens até o teste entregar. */
function novoCanal() {
  const pontas: Sincronia[] = [];
  const fila: { de: Sincronia; evento: "update" | "awareness"; dados: Uint8Array }[] = [];
  return {
    pontas,
    fila,
    entregar(ordem: "normal" | "invertida" = "normal", duplicar = false) {
      const lote = ordem === "invertida" ? [...fila].reverse() : [...fila];
      fila.length = 0;
      for (const m of duplicar ? [...lote, ...lote] : lote) {
        for (const p of pontas) if (p !== m.de) p.receber(m.evento, m.dados);
      }
    },
  };
}

function transporte(
  banco: Banco,
  canal: ReturnType<typeof novoCanal>,
  quem: () => Sincronia,
  falhas = { gravar: 0 },
): Transporte & { gravados: number; compactacoes: number[] } {
  const t = {
    gravados: 0,
    compactacoes: [] as number[],
    async carregar() {
      return { snapshot: banco.snapshot, pedacos: [...banco.pedacos] };
    },
    async buscarDepois(id: number) {
      return banco.pedacos.filter((p) => p.id > id);
    },
    async gravar(update: Uint8Array) {
      if (falhas.gravar > 0) {
        falhas.gravar -= 1;
        throw new Error("banco fora do ar");
      }
      const id = banco.proximo++;
      banco.pedacos.push({ id, update });
      t.gravados += 1;
      return id;
    },
    transmitir(evento: "update" | "awareness", dados: Uint8Array) {
      canal.fila.push({ de: quem(), evento, dados });
    },
    async compactar(snapshot: Uint8Array, ate: number) {
      banco.snapshot = snapshot;
      banco.pedacos = banco.pedacos.filter((p) => p.id > ate);
      t.compactacoes.push(ate);
    },
  };
  return t;
}

/** Depósito falso: o que o IndexedDB do aparelho faria. */
function deposito(): Deposito & { guardados: Map<string, Uint8Array> } {
  const guardados = new Map<string, Uint8Array>();
  let proxima = 1;

  return {
    guardados,
    async guardar(update) {
      const chave = String(proxima++);
      guardados.set(chave, update);
      return chave;
    },
    async pendentes() {
      return [...guardados].map(([chave, update]) => ({ chave, update }));
    },
    async limpar(chaves) {
      for (const chave of chaves) guardados.delete(chave);
    },
  };
}

/** Uma pessoa com o editor aberto: documento, sincronia e transporte. */
async function abrir(
  banco: Banco,
  canal: ReturnType<typeof novoCanal>,
  opcoes: {
    falhas?: { gravar: number };
    limiteCompactacao?: number;
    deposito?: Deposito;
  } = {},
) {
  const doc = new Y.Doc();
  const ref: { s?: Sincronia } = {};
  const t = transporte(banco, canal, () => ref.s!, opcoes.falhas);
  const estados: string[] = [];
  const s = new Sincronia(doc, t, {
    limiteCompactacao: opcoes.limiteCompactacao ?? 50,
    esperaRetentativa: 0,
    aoMudarEstado: (e) => estados.push(e),
    deposito: opcoes.deposito,
  });
  ref.s = s;
  canal.pontas.push(s);
  await s.iniciar();
  return { doc, s, t, estados, texto: () => doc.getText("t").toString() };
}

/** Deixa as gravações assíncronas (e retentativas) terminarem. */
const assentar = () => new Promise((r) => setTimeout(r, 20));

describe("conversões", () => {
  const bytes = new Uint8Array([0, 1, 127, 128, 255]);

  it("bytea do Postgres vai e volta", () => {
    expect(paraBytea(bytes)).toBe("\\x00017f80ff");
    expect(deBytea(paraBytea(bytes))).toEqual(bytes);
  });

  it("base64 do canal vai e volta", () => {
    expect(deBase64(paraBase64(bytes))).toEqual(bytes);
  });
});

describe("Sincronia", () => {
  it("duas pessoas escrevendo juntas terminam com o mesmo texto", async () => {
    const banco = novoBanco();
    const canal = novoCanal();
    const ana = await abrir(banco, canal);
    const bia = await abrir(banco, canal);

    ana.doc.getText("t").insert(0, "Carta do Ridauto. ");
    bia.doc.getText("t").insert(0, "Carta do Marcos. ");
    canal.entregar();
    await assentar();

    expect(ana.texto()).toBe(bia.texto());
    expect(ana.texto()).toContain("Ridauto");
    expect(ana.texto()).toContain("Marcos");
  });

  it("cada edição local vai ao banco uma vez; a recebida não é regravada", async () => {
    const banco = novoBanco();
    const canal = novoCanal();
    const ana = await abrir(banco, canal);
    const bia = await abrir(banco, canal);

    ana.doc.getText("t").insert(0, "a");
    canal.entregar();
    await assentar();

    expect(ana.t.gravados).toBe(1);
    // Se a Bia regravasse o que recebeu, cada letra viraria N linhas.
    expect(bia.t.gravados).toBe(0);
    expect(banco.pedacos).toHaveLength(1);
  });

  it("quem chega depois lê tudo do banco", async () => {
    const banco = novoBanco();
    const canal = novoCanal();
    const ana = await abrir(banco, canal);
    ana.doc.getText("t").insert(0, "Estratégia do caso");
    await assentar();

    const caio = await abrir(banco, canal);
    expect(caio.texto()).toBe("Estratégia do caso");
  });

  it("mensagem fora de ordem ou repetida não estraga o texto", async () => {
    const banco = novoBanco();
    const canal = novoCanal();
    const ana = await abrir(banco, canal);
    const bia = await abrir(banco, canal);

    const t = ana.doc.getText("t");
    t.insert(0, "um ");
    t.insert(3, "dois ");
    t.insert(8, "três");
    canal.entregar("invertida", true);
    await assentar();

    expect(bia.texto()).toBe("um dois três");
  });

  it("ao reconectar, recupera pelo banco o que o canal perdeu", async () => {
    const banco = novoBanco();
    const canal = novoCanal();
    const ana = await abrir(banco, canal);
    const bia = await abrir(banco, canal);

    ana.doc.getText("t").insert(0, "antes ");
    canal.entregar();
    await assentar();

    // A Bia cai: o que a Ana escreve agora não chega pelo canal.
    ana.doc.getText("t").insert(6, "durante");
    canal.fila.length = 0;
    await assentar();
    expect(bia.texto()).toBe("antes ");

    await bia.s.reconectar();
    expect(bia.texto()).toBe("antes durante");

    // Da próxima vez, lê só depois do último pedaço que veio do banco — não
    // do id da própria gravação, que pode pular pedaço alheio ainda em trânsito.
    const busca = vi.spyOn(bia.t, "buscarDepois");
    await bia.s.reconectar();
    expect(busca).toHaveBeenCalledWith(banco.pedacos.at(-1)!.id);
  });

  it("gravação recusada fica guardada, avisa e sobe na próxima tentativa", async () => {
    const banco = novoBanco();
    const canal = novoCanal();
    const ana = await abrir(banco, canal, { falhas: { gravar: 2 } });

    ana.doc.getText("t").insert(0, "não pode sumir");
    await assentar();
    await assentar();

    expect(ana.estados).toContain("erro");
    expect(ana.estados.at(-1)).toBe("salvo");

    const caio = await abrir(banco, canal);
    expect(caio.texto()).toBe("não pode sumir");
  });

  it("com pedaços demais ao abrir, compacta — e o texto continua inteiro", async () => {
    const banco = novoBanco();
    const canal = novoCanal();
    const ana = await abrir(banco, canal);
    const t = ana.doc.getText("t");
    // Uma edição por vez: edições rápidas se juntam num pedaço só, de
    // propósito — aqui o teste precisa de seis.
    for (let i = 0; i < 6; i++) {
      t.insert(t.length, `${i}`);
      await assentar();
    }
    expect(banco.pedacos).toHaveLength(6);

    const bia = await abrir(banco, canal, { limiteCompactacao: 5 });
    await assentar();
    expect(bia.t.compactacoes).toEqual([6]);
    expect(banco.pedacos).toHaveLength(0);

    const caio = await abrir(banco, canal);
    expect(caio.texto()).toBe("012345");
  });

  it("presença: o estado de quem está na página chega aos outros", async () => {
    const banco = novoBanco();
    const canal = novoCanal();
    const ana = await abrir(banco, canal);
    const bia = await abrir(banco, canal);

    ana.s.awareness.setLocalStateField("user", { name: "Renato", color: "#f60" });
    canal.entregar();

    const estados = [...bia.s.awareness.getStates().values()];
    expect(estados).toContainEqual({ user: { name: "Renato", color: "#f60" } });
  });

  it("o que a pessoa digitou fica no aparelho antes de ir ao banco", async () => {
    // Toda a durabilidade dependia de um array em memória. Fechar a aba com o
    // banco fora do ar perdia o texto, e o aviso na tela dizia só "tentando
    // de novo" — a pessoa via o problema e perdia mesmo assim.
    const banco = novoBanco();
    const canal = novoCanal();
    const dep = deposito();
    const ana = await abrir(banco, canal, { falhas: { gravar: 99 }, deposito: dep });

    ana.doc.getText("t").insert(0, "não pode sumir");
    await assentar();

    expect(dep.guardados.size).toBeGreaterThan(0);
    expect(banco.pedacos).toHaveLength(0);
  });

  it("o depósito esvazia quando o banco confirma", async () => {
    const banco = novoBanco();
    const canal = novoCanal();
    const dep = deposito();
    const ana = await abrir(banco, canal, { deposito: dep });

    ana.doc.getText("t").insert(0, "subiu");
    await assentar();

    expect(banco.pedacos).toHaveLength(1);
    expect(dep.guardados.size).toBe(0);
  });

  it("fechar a aba e reabrir traz de volta o que não tinha subido", async () => {
    const banco = novoBanco();
    const canal = novoCanal();
    const dep = deposito();

    const antes = await abrir(banco, canal, { falhas: { gravar: 99 }, deposito: dep });
    antes.doc.getText("t").insert(0, "escrito no avião");
    await assentar();
    antes.s.destruir();

    // Aba nova, banco de volta: o texto reaparece e sobe.
    const depois = await abrir(banco, canal, { deposito: dep });
    await assentar();

    expect(depois.texto()).toBe("escrito no avião");
    expect(banco.pedacos.length).toBeGreaterThan(0);
    expect(dep.guardados.size).toBe(0);
  });

  it("o lote em voo não some se a gravação falhar", async () => {
    // A fila era esvaziada ANTES do await da rede: morrer nessa janela
    // perdia o lote sem deixar rastro em lugar nenhum.
    const banco = novoBanco();
    const canal = novoCanal();
    const dep = deposito();
    const ana = await abrir(banco, canal, { falhas: { gravar: 1 }, deposito: dep });

    ana.doc.getText("t").insert(0, "primeiro");
    await assentar();
    await assentar();

    expect(ana.texto()).toBe("primeiro");
    const caio = await abrir(banco, canal);
    expect(caio.texto()).toBe("primeiro");
  });

  it("sem depósito, continua funcionando como antes", async () => {
    // O depósito é opcional: quem monta o editor fora do navegador (teste,
    // servidor) não tem IndexedDB, e isso não pode quebrar a sincronia.
    const banco = novoBanco();
    const canal = novoCanal();
    const ana = await abrir(banco, canal);

    ana.doc.getText("t").insert(0, "sem aparelho");
    await assentar();

    expect(banco.pedacos).toHaveLength(1);
  });
});
