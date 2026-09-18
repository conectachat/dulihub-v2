import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { clienteFalso, entregar, novoMundo, type Mundo } from "./supabase-falso";

/**
 * O provedor e o editor de verdade, sobre um Supabase de mentira.
 *
 * `sincronia.test.ts` prova a lógica; este prova a tradução para as tabelas e
 * o canal, e que o Plate monta com o nosso provedor — o que nenhum teste de
 * banco nem a fumaça (o editor não vem no HTML) conseguem ver.
 */

// O jsdom não tem o que o navegador tem e o Plate usa para medir a tela.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

let mundoAtual: Mundo;
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => clienteFalso(mundoAtual),
}));

const { ProvedorSupabase, ganchosDasPaginas } = await import("./provedor-supabase");

const PAGINA = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";

function abrir() {
  const doc = new Y.Doc();
  const sincronizou = new Promise<void>((resolve) => {
    const p = new ProvedorSupabase({
      doc,
      options: { paginaId: PAGINA, organizationId: ORG },
      onSyncChange: (ok) => ok && resolve(),
    });
    p.connect();
    abertos.push(p);
  });
  return { doc, sincronizou };
}

const abertos: InstanceType<typeof ProvedorSupabase>[] = [];
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  for (const p of abertos.splice(0)) p.destroy();
  ganchosDasPaginas.clear();
});

describe("ProvedorSupabase", () => {
  it("grava a edição como pedaço da página e entrega ao outro pelo canal", async () => {
    mundoAtual = novoMundo(PAGINA);
    const ana = abrir();
    const bia = abrir();
    await Promise.all([ana.sincronizou, bia.sincronizou]);
    await esperar(10);

    ana.doc.getText("t").insert(0, "Carta do Ridauto");
    await esperar(20);
    entregar(mundoAtual);

    expect(bia.doc.getText("t").toString()).toBe("Carta do Ridauto");
    expect(mundoAtual.updates).toHaveLength(1);
    expect(mundoAtual.updates[0]).toMatchObject({
      page_id: PAGINA,
      organization_id: ORG,
    });
    // Formato que o PostgREST aceita para bytea.
    expect(String(mundoAtual.updates[0].update)).toMatch(/^\\x[0-9a-f]+$/);
  });

  it("quem abre depois lê do banco o que já foi escrito", async () => {
    mundoAtual = novoMundo(PAGINA);
    const ana = abrir();
    await ana.sincronizou;
    ana.doc.getText("t").insert(0, "Estratégia do caso");
    await esperar(20);

    const caio = abrir();
    await caio.sincronizou;
    expect(caio.doc.getText("t").toString()).toBe("Estratégia do caso");
  });

  it("numa pausa, grava o conteúdo legível da página", async () => {
    mundoAtual = novoMundo(PAGINA);
    ganchosDasPaginas.set(PAGINA, { conteudo: () => [{ type: "p", children: [{ text: "oi" }] }] });
    const ana = abrir();
    await ana.sincronizou;

    ana.doc.getText("t").insert(0, "oi");
    await esperar(2_300);

    expect(mundoAtual.pages[0].content).toEqual([{ type: "p", children: [{ text: "oi" }] }]);
    expect(mundoAtual.pages[0].updated_by).toBe("u1");
  }, 10_000);
});

describe("editor das Observações", () => {
  it("monta com o provedor, sincroniza e grava a página inicial", async () => {
    mundoAtual = novoMundo(PAGINA);
    const { default: ObservacoesEditor } = await import(
      "@/components/editor/observacoes-editor"
    );
    const estados: string[] = [];

    render(
      <ObservacoesEditor
        paginaId={PAGINA}
        organizationId={ORG}
        projectId="p"
        usuario={{ id: "u1", nome: "Renato" }}
        equipe={[{ id: "u1", nome: "Renato" }]}
        aoMudarEstado={(e) => estados.push(e)}
      />,
    );

    // O Plate grava o valor inicial (um parágrafo vazio) no Yjs, e isso vira
    // o primeiro pedaço no banco: prova que editor, plugin e provedor estão
    // ligados de ponta a ponta.
    await waitFor(() => expect(mundoAtual.updates.length).toBeGreaterThan(0), {
      timeout: 8_000,
    });
    expect(estados).toContain("salvo");
    await waitFor(
      () => expect(document.querySelector("[data-slate-editor]")).not.toBeNull(),
      { timeout: 8_000 },
    );
    // Carregar o Plate inteiro no jsdom leva dezenas de segundos.
  }, 90_000);
});
