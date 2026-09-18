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
  private pendentes: Uint8Array[] = [];
  private gravando = false;
  private destruida = false;
  private readonly limite: number;
  private readonly espera: number;
  private readonly avisar: (e: Estado) => void;
  /** Presença criada aqui é destruída aqui; a de fora, quem criou destrói. */
  private readonly presencaPropria: boolean;

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
    } = {},
  ) {
    this.presencaPropria = !opcoes.awareness;
    this.awareness = opcoes.awareness ?? new Awareness(doc);
    this.limite = opcoes.limiteCompactacao ?? 50;
    this.espera = opcoes.esperaRetentativa ?? 3_000;
    this.avisar = opcoes.aoMudarEstado ?? (() => {});
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
    this.pendentes.push(update);
    this.gravarPendentes();
  };

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
  private async gravarPendentes(): Promise<void> {
    if (this.gravando || this.destruida || this.pendentes.length === 0) return;
    this.gravando = true;
    this.avisar("salvando");

    const lote = this.pendentes;
    this.pendentes = [];
    try {
      await this.transporte.gravar(Y.mergeUpdates(lote));
      this.gravando = false;
      if (this.pendentes.length > 0) return this.gravarPendentes();
      this.avisar("salvo");
    } catch {
      this.pendentes = [...lote, ...this.pendentes];
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
