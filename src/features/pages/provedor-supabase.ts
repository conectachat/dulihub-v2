"use client";

import type { UnifiedProvider } from "@platejs/yjs";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";

import { createClient } from "@/lib/supabase/client";

import { depositoLocal } from "./deposito-local";
import {
  deBase64,
  deBytea,
  paraBase64,
  paraBytea,
  Sincronia,
  type Estado,
  type Transporte,
} from "./sincronia";

/**
 * Provedor do Plate que sincroniza pelo Supabase — banco + canal privado.
 *
 * A lógica difícil mora em `Sincronia` (testada sem rede). Aqui só se traduz:
 * tabelas `project_page_updates`/`project_pages` da 0024, canal
 * `pagina:<id>` com as policies de `realtime.messages`, e os eventos que o
 * Plate espera de um provedor.
 */

export type GanchosDoProvedor = {
  aoMudarEstado?: (e: Estado) => void;
  /** Valor atual do editor, para gravar o conteúdo legível. */
  conteudo?: () => unknown;
};

export type OpcoesDoProvedor = {
  paginaId: string;
  organizationId: string;
};

/**
 * Ganchos de cada página aberta, por id.
 *
 * O provedor nasce junto com o editor, antes de `editor.children` existir; o
 * componente registra aqui num efeito, e o provedor lê na hora de usar. Fora
 * do React de propósito: estado ou `ref` passados ao criar o editor são lidos
 * durante a renderização, e o compilador do React recusa.
 */
export const ganchosDasPaginas = new Map<string, GanchosDoProvedor>();

/** Acima disto o pedaço não vai pelo canal: os outros o leem do banco. */
const MAIOR_MENSAGEM = 200_000;
/** De quanto em quanto tempo relê o banco, para o que o canal deixar cair. */
const CONFERENCIA_MS = 15_000;
/** Pausa de edição antes de gravar o conteúdo legível ("Editado às..."). */
const PAUSA_CONTEUDO_MS = 2_000;

export class ProvedorSupabase implements UnifiedProvider {
  readonly type = "supabase";
  readonly document: Y.Doc;
  readonly awareness: Awareness;
  isConnected = false;
  isSynced = false;

  private readonly supabase = createClient();
  private readonly sincronia: Sincronia;
  private canal: RealtimeChannel | null = null;
  private conferencia: ReturnType<typeof setInterval> | null = null;
  private pausa: ReturnType<typeof setTimeout> | null = null;
  private iniciada: Promise<void> | null = null;

  constructor(
    private readonly props: {
      options: OpcoesDoProvedor;
      awareness?: Awareness;
      doc?: Y.Doc;
      onConnect?: () => void;
      onDisconnect?: () => void;
      onError?: (error: Error) => void;
      onSyncChange?: (isSynced: boolean) => void;
    },
  ) {
    this.document = props.doc ?? new Y.Doc();
    const { paginaId, organizationId } = props.options;
    const supabase = this.supabase;

    const transporte: Transporte = {
      carregar: async () => {
        const [pagina, pedacos] = await Promise.all([
          supabase.from("project_pages").select("snapshot").eq("id", paginaId).single(),
          supabase
            .from("project_page_updates")
            .select("id, update")
            .eq("page_id", paginaId)
            .order("id"),
        ]);
        if (pagina.error) throw pagina.error;
        if (pedacos.error) throw pedacos.error;
        return {
          snapshot: pagina.data.snapshot ? deBytea(pagina.data.snapshot) : null,
          pedacos: pedacos.data.map((p) => ({ id: p.id, update: deBytea(p.update) })),
        };
      },
      buscarDepois: async (id) => {
        const { data, error } = await supabase
          .from("project_page_updates")
          .select("id, update")
          .eq("page_id", paginaId)
          .gt("id", id)
          .order("id");
        if (error) throw error;
        return data.map((p) => ({ id: p.id, update: deBytea(p.update) }));
      },
      gravar: async (update) => {
        const { data, error } = await supabase
          .from("project_page_updates")
          .insert({
            organization_id: organizationId,
            page_id: paginaId,
            update: paraBytea(update),
          })
          .select("id")
          .single();
        if (error) throw error;
        return data.id;
      },
      transmitir: (evento, dados) => {
        if (!this.canal || !this.isConnected || dados.length > MAIOR_MENSAGEM) return;
        void this.canal.send({ type: "broadcast", event: evento, payload: { d: paraBase64(dados) } });
      },
      compactar: async (snapshot, ate) => {
        const { error } = await supabase.rpc("compactar_pagina", {
          p_page: paginaId,
          p_snapshot: paraBytea(snapshot),
          p_ate: ate,
          p_content: (ganchosDasPaginas.get(paginaId)?.conteudo?.() ?? null) as never,
        });
        if (error) throw error;
      },
    };

    this.sincronia = new Sincronia(this.document, transporte, {
      awareness: props.awareness,
      // O que for digitado fica no aparelho até o banco confirmar. Sem isto,
      // fechar a aba com a gravação recusada perdia o texto — e a tela
      // dizia só "tentando de novo".
      deposito: depositoLocal(paginaId),
      aoMudarEstado: (estado) => {
        ganchosDasPaginas.get(paginaId)?.aoMudarEstado?.(estado);
        if (estado === "salvo" && this.isSynced) this.agendarConteudo();
      },
    });
    this.awareness = this.sincronia.awareness;
  }

  connect(): void {
    // Banco primeiro: é a fonte. O canal só adianta.
    this.iniciada ??= this.sincronia
      .iniciar()
      .then(() => {
        this.isSynced = true;
        this.props.onSyncChange?.(true);
      })
      .catch((e) => {
        this.props.onError?.(e instanceof Error ? e : new Error(String(e)));
      });

    const canal = this.supabase.channel(`pagina:${this.props.options.paginaId}`, {
      config: { private: true, broadcast: { self: false } },
    });
    for (const evento of ["update", "awareness"] as const) {
      canal.on("broadcast", { event: evento }, ({ payload }) => {
        const d = (payload as { d?: unknown })?.d;
        if (typeof d === "string") this.sincronia.receber(evento, deBase64(d));
      });
    }
    canal.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        this.isConnected = true;
        this.props.onConnect?.();
        // O que passou entre ler o banco e o canal abrir, e o que caiu
        // enquanto estava desconectado.
        await this.iniciada;
        await this.sincronia.reconectar().catch(() => {});
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        if (this.isConnected) this.props.onDisconnect?.();
        this.isConnected = false;
      }
    });
    this.canal = canal;

    this.conferencia ??= setInterval(() => {
      if (this.sincronia.pronto) void this.sincronia.reconectar().catch(() => {});
    }, CONFERENCIA_MS);
  }

  disconnect(): void {
    if (this.conferencia) clearInterval(this.conferencia);
    this.conferencia = null;
    if (this.canal) void this.supabase.removeChannel(this.canal);
    this.canal = null;
    if (this.isConnected) this.props.onDisconnect?.();
    this.isConnected = false;
  }

  destroy(): void {
    if (this.pausa) {
      clearTimeout(this.pausa);
      void this.gravarConteudo();
    }
    this.disconnect();
    this.sincronia.destruir();
  }

  /** "Editado às 14:05 por Renato": o texto legível vai ao banco numa pausa. */
  private agendarConteudo() {
    if (this.pausa) clearTimeout(this.pausa);
    this.pausa = setTimeout(() => {
      this.pausa = null;
      void this.gravarConteudo();
    }, PAUSA_CONTEUDO_MS);
  }

  private async gravarConteudo() {
    const conteudo = ganchosDasPaginas.get(this.props.options.paginaId)?.conteudo?.();
    if (conteudo === undefined) return;
    const { data } = await this.supabase.auth.getUser();
    await this.supabase
      .from("project_pages")
      .update({
        content: conteudo as never,
        updated_at: new Date().toISOString(),
        updated_by: data.user?.id ?? null,
      })
      .eq("id", this.props.options.paginaId);
  }
}
