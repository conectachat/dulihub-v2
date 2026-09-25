import * as Y from "yjs";
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";

/**
 * Sincronização de uma página editada por várias pessoas ao mesmo tempo.
 *
 * Sem servidor próprio: o **banco** guarda cada pedaço de edição e é a fonte
 * da verdade; o **canal** em tempo real só adianta a entrega. Quem chega
 * atrasado, cai ou perde mensagem relê do banco. O Yjs garante que aplicar os
 * mesmos pedaços em qualquer ordem, até repetidos, dá o mesmo texto.
 *
 * Não conhece Supabase nem o editor: recebe um `Transporte`. Assim os casos
 * difíceis — fora de ordem, repetido, gravação recusada — são testados em
 * `sincronia.test.ts` sem rede.
 */

export type Pedaco = { id: number; update: Uint8Array };

/**
 * Onde o que foi digitado fica **antes** de o banco confirmar.
 *
 * Existe porque a durabilidade dependia de um array em memória: fechar a aba
 * com a gravação recusada perdia o texto, e a tela dizia só "tentando de
 * novo" — a pessoa via o problema acontecer e perdia mesmo assim.
 *
 * É opcional: quem monta a sincronia fora do navegador não tem onde guardar,
 * e isso não pode impedir a edição.
 */
export interface Deposito {
  /** Guarda um update e devolve a chave para apagá-lo depois. */
  guardar(update: Uint8Array): Promise<string>;
  pendentes(): Promise<{ chave: string; update: Uint8Array }[]>;
  limpar(chaves: string[]): Promise<void>;
}

/** Um update esperando o banco. `chave` chega quando o depósito responde. */
type Pendente = { update: Uint8Array; chave?: string };

export type Estado = "carregando" | "salvando" | "salvo" | "erro";

export interface Transporte {
  carregar(): Promise<{ snapshot: Uint8Array | null; pedacos: Pedaco[] }>;
  buscarDepois(id: number): Promise<Pedaco[]>;
  /** Grava um pedaço e devolve o id que o banco deu. */
  gravar(update: Uint8Array): Promise<number>;
  transmitir(evento: "update" | "awareness", dados: Uint8Array): void;
  /** Troca os pedaços até `ate` (inclusive) por um snapshot. */
  compactar(snapshot: Uint8Array, ate: number): Promise<void>;
}

/** Origem das mudanças que vieram de fora — essas não se regravam nem se retransmitem. */
const REMOTO = Symbol("remoto");

export class Sincronia {
  readonly awareness: Awareness;
  pronto = false;

  private ultimoId = 0;
  private pendentes: Pendente[] = [];
  private gravando = false;
  private destruida = false;
  private readonly limite: number;
  private readonly espera: number;
  private readonly avisar: (e: Estado) => void;
  /** Presença criada aqui é destruída aqui; a de fora, quem criou destrói. */
  private readonly presencaPropria: boolean;
  private readonly deposito: Deposito | null;

  constructor(
    private readonly doc: Y.Doc,
    private readonly transporte: Transporte,
    opcoes: {
      /** Acima de tantos pedaços ao abrir, compacta. */
      limiteCompactacao?: number;
      /** Espera antes de tentar gravar de novo, em ms. */
      esperaRetentativa?: number;
      aoMudarEstado?: (e: Estado) => void;
      /** Presença já criada por quem monta o editor (o Plate cria a dele). */
      awareness?: Awareness;
      /** Onde guardar o pendente enquanto o banco não confirma. */
      deposito?: Deposito;
    } = {},
  ) {
    this.presencaPropria = !opcoes.awareness;
    this.awareness = opcoes.awareness ?? new Awareness(doc);
    this.limite = opcoes.limiteCompactacao ?? 50;
    this.espera = opcoes.esperaRetentativa ?? 3_000;
    this.avisar = opcoes.aoMudarEstado ?? (() => {});
    this.deposito = opcoes.deposito ?? null;
  }

  async iniciar(): Promise<void> {
    this.avisar("carregando");
    const { snapshot, pedacos } = await this.transporte.carregar();

    if (snapshot) Y.applyUpdate(this.doc, snapshot, REMOTO);
    this.aplicarDoBanco(pedacos);

    this.doc.on("update", this.aoAtualizar);
    this.awareness.on("update", this.aoMudarPresenca);
    this.pronto = true;
    this.avisar("salvo");

    // O que ficou no aparelho da última vez: aplica no documento e recoloca
    // na fila. É o que faz o texto **voltar** depois de um fechamento feio.
    await this.recuperarDoDeposito();

    // Anuncia a presença: quem já está na página responde com a dela.
    this.transmitirPresenca([this.doc.clientID]);

    if (pedacos.length > this.limite) {
      // Falhar aqui não perde nada — os pedaços continuam no banco.
      await this.transporte
        .compactar(Y.encodeStateAsUpdate(this.doc), this.ultimoId)
        .catch(() => {});
    }
  }

  /** Mensagem vinda do canal. */
  receber(evento: "update" | "awareness", dados: Uint8Array): void {
    if (!this.pronto) return;
    if (evento === "update") {
      Y.applyUpdate(this.doc, dados, REMOTO);
      return;
    }
    const conhecidos = new Set(this.awareness.getStates().keys());
    applyAwarenessUpdate(this.awareness, dados, REMOTO);
    // Alguém novo chegou: manda a própria presença para ele enxergar quem já
    // estava.
    const novos = [...this.awareness.getStates().keys()].some(
      (id) => !conhecidos.has(id),
    );
    if (novos) this.transmitirPresenca([this.doc.clientID]);
  }

  /** Depois de cair: relê do banco o que pode ter passado pelo canal sem chegar. */
  async reconectar(): Promise<void> {
    this.aplicarDoBanco(await this.transporte.buscarDepois(this.ultimoId));
    this.transmitirPresenca([this.doc.clientID]);
    this.gravarPendentes();
  }

  destruir(): void {
    // Uma última tentativa antes de desligar: navegar entre telas do app
    // descartava o pendente sem a aba sequer fechar. O que não subir aqui
    // continua no depósito, e volta na próxima abertura.
    void this.gravarPendentes();

    this.destruida = true;
    this.doc.off("update", this.aoAtualizar);
    // Avisa os outros que saiu, antes de desligar a presença.
    removeAwarenessStates(this.awareness, [this.doc.clientID], "saiu");
    this.awareness.off("update", this.aoMudarPresenca);
    if (this.presencaPropria) this.awareness.destroy();
  }

  // ------------------------------------------------------------------------

  private aplicarDoBanco(pedacos: Pedaco[]) {
    if (pedacos.length === 0) return;
    Y.applyUpdate(this.doc, Y.mergeUpdates(pedacos.map((p) => p.update)), REMOTO);
    // Só avança com o que veio do banco. O id de gravação própria não serve:
    // pedaços de outros com id menor podem ainda não ter chegado.
    this.ultimoId = Math.max(this.ultimoId, ...pedacos.map((p) => p.id));
  }

  private aoAtualizar = (update: Uint8Array, origem: unknown) => {
    if (origem === REMOTO) return;
    this.transporte.transmitir("update", update);

    const pendente: Pendente = { update };
    this.pendentes.push(pendente);
    // Vai para o aparelho na hora, e não no fechamento da aba: `pagehide` não
    // espera promessa, e o que se perde ali é exatamente o que importa.
    void this.deposito?.guardar(update).then((chave) => {
      pendente.chave = chave;
    });

    this.gravarPendentes();
  };

  /** Recoloca na fila o que o aparelho guardou e o banco nunca recebeu. */
  private async recuperarDoDeposito(): Promise<void> {
    if (!this.deposito) return;

    const guardados = await this.deposito.pendentes().catch(() => []);
    if (guardados.length === 0) return;

    // Origem remota: aplicar no documento não pode reenfileirar o mesmo
    // update — quem cuida de subi-lo é a fila, logo abaixo.
    Y.applyUpdate(this.doc, Y.mergeUpdates(guardados.map((g) => g.update)), REMOTO);
    for (const g of guardados) this.pendentes.push({ update: g.update, chave: g.chave });

    this.gravarPendentes();
  }

  private aoMudarPresenca = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origem: unknown,
  ) => {
    if (origem === REMOTO) return;
    this.transmitirPresenca([...added, ...updated, ...removed]);
  };

  private transmitirPresenca(clientes: number[]) {
    this.transporte.transmitir("awareness", encodeAwarenessUpdate(this.awareness, clientes));
  }

  /**
   * Grava o que está pendente, um lote por vez. Recusado, o lote volta para a
   * fila e tenta de novo — o texto nunca sai da memória antes de o banco
   * confirmar.
   */
  async gravarPendentes(): Promise<void> {
    if (this.gravando || this.destruida || this.pendentes.length === 0) return;
    this.gravando = true;
    this.avisar("salvando");

    // O lote **não** sai da fila antes da resposta. Sair antes era uma janela
    // em que o texto não estava mais na fila nem tinha chegado ao banco:
    // morrer ali perdia o lote sem deixar rastro.
    const lote = [...this.pendentes];
    try {
      await this.transporte.gravar(Y.mergeUpdates(lote.map((p) => p.update)));

      this.pendentes = this.pendentes.filter((p) => !lote.includes(p));
      const chaves = lote.map((p) => p.chave).filter((c): c is string => Boolean(c));
      if (chaves.length) await this.deposito?.limpar(chaves).catch(() => {});

      this.gravando = false;
      if (this.pendentes.length > 0) return this.gravarPendentes();
      this.avisar("salvo");
    } catch {
      this.gravando = false;
      this.avisar("erro");
      setTimeout(() => this.gravarPendentes(), this.espera);
    }
  }
}

// ---------------------------------------------------------------- conversões

/** Bytes para o formato `bytea` que o PostgREST aceita e devolve: `\x` + hex. */
export function paraBytea(bytes: Uint8Array): string {
  let hex = "\\x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

export function deBytea(texto: string): Uint8Array {
  const hex = texto.startsWith("\\x") ? texto.slice(2) : texto;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** O canal leva JSON: bytes viajam em base64. */
export function paraBase64(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
}

export function deBase64(texto: string): Uint8Array {
  const binario = atob(texto);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}
