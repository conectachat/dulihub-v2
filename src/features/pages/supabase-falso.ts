/**
 * Supabase de mentira para testar o provedor e o editor sem rede.
 *
 * Cobre só o que `provedor-supabase.ts` usa: duas tabelas, a RPC de
 * compactação, canal com broadcast e `auth.getUser`. Um `Mundo` é o banco e o
 * canal compartilhados; cada `clienteFalso(mundo)` é uma pessoa com o app
 * aberto.
 */

type Linha = Record<string, unknown>;

export type Mundo = {
  pages: Linha[];
  updates: Linha[];
  proximoId: number;
  canais: Map<string, Set<CanalFalso>>;
  /** Mensagens seguradas até `entregar()` — o teste decide quando chegam. */
  fila: { de: CanalFalso; topico: string; event: string; payload: unknown }[];
};

export function novoMundo(paginaId: string): Mundo {
  return {
    pages: [{ id: paginaId, snapshot: null, content: null }],
    updates: [],
    proximoId: 1,
    canais: new Map(),
    fila: [],
  };
}

export function entregar(mundo: Mundo) {
  const lote = mundo.fila.splice(0);
  for (const m of lote) {
    for (const c of mundo.canais.get(m.topico) ?? []) {
      if (c !== m.de) c.disparar(m.event, m.payload);
    }
  }
}

class CanalFalso {
  private ouvintes: { event: string; fn: (m: { payload: unknown }) => void }[] = [];
  constructor(
    private mundo: Mundo,
    readonly topico: string,
  ) {}
  on(_tipo: string, filtro: { event: string }, fn: (m: { payload: unknown }) => void) {
    this.ouvintes.push({ event: filtro.event, fn });
    return this;
  }
  subscribe(cb: (status: string) => void) {
    const set = this.mundo.canais.get(this.topico) ?? new Set();
    set.add(this);
    this.mundo.canais.set(this.topico, set);
    queueMicrotask(() => cb("SUBSCRIBED"));
    return this;
  }
  async send(m: { event: string; payload: unknown }) {
    this.mundo.fila.push({ de: this, topico: this.topico, ...m });
    return "ok";
  }
  disparar(event: string, payload: unknown) {
    for (const o of this.ouvintes) if (o.event === event || o.event === "*") o.fn({ payload });
  }
  sair() {
    this.mundo.canais.get(this.topico)?.delete(this);
  }
}

/** Consulta encadeada mínima: filtros aplicados ao resolver. */
function consulta(linhas: () => Linha[], acao?: (filtradas: Linha[]) => Linha[]) {
  const filtros: ((l: Linha) => boolean)[] = [];
  let ordem: string | null = null;
  const q = {
    select: () => q,
    eq: (col: string, v: unknown) => (filtros.push((l) => l[col] === v), q),
    gt: (col: string, v: number) => (filtros.push((l) => (l[col] as number) > v), q),
    order: (col: string) => ((ordem = col), q),
    resolver() {
      let r = linhas().filter((l) => filtros.every((f) => f(l)));
      if (acao) r = acao(r);
      if (ordem) r = [...r].sort((a, b) => (a[ordem!] as number) - (b[ordem!] as number));
      return r;
    },
    single: async () => {
      const r = q.resolver();
      return r.length === 1
        ? { data: r[0], error: null }
        : { data: null, error: { message: "não é uma linha só" } };
    },
    then: (ok: (v: { data: Linha[]; error: null }) => unknown) =>
      Promise.resolve({ data: q.resolver(), error: null }).then(ok),
  };
  return q;
}

export function clienteFalso(mundo: Mundo) {
  const canais: CanalFalso[] = [];
  return {
    from(tabela: "project_pages" | "project_page_updates") {
      const linhas = () => (tabela === "project_pages" ? mundo.pages : mundo.updates);
      return {
        select: () => consulta(linhas),
        insert: (linha: Linha) => ({
          select: () => ({
            single: async () => {
              const nova = { ...linha, id: mundo.proximoId++ };
              mundo.updates.push(nova);
              return { data: nova, error: null };
            },
          }),
        }),
        update: (mudanca: Linha) =>
          consulta(linhas, (alvo) => {
            for (const l of alvo) Object.assign(l, mudanca);
            return alvo;
          }),
      };
    },
    async rpc(_nome: "compactar_pagina", p: { p_page: string; p_snapshot: string; p_ate: number; p_content: unknown }) {
      const pagina = mundo.pages.find((x) => x.id === p.p_page)!;
      pagina.snapshot = p.p_snapshot;
      pagina.content = p.p_content;
      mundo.updates = mundo.updates.filter(
        (u) => u.page_id !== p.p_page || (u.id as number) > p.p_ate,
      );
      return { error: null };
    },
    channel(topico: string) {
      const c = new CanalFalso(mundo, topico);
      canais.push(c);
      return c;
    },
    async removeChannel(c: CanalFalso) {
      c.sair();
    },
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  };
}
