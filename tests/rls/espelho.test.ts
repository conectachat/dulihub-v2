// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sincronizar, type Armazem, type Linha } from "@/lib/local/espelho";
import { transporteSupabase } from "@/lib/local/transporte-supabase";

import { entrarComo, type Cliente } from "./clientes";

/**
 * O espelho offline contra o banco **de verdade**.
 *
 * `src/lib/local/espelho.test.ts` prova a lógica sem rede. Este prova o que
 * só o banco pode dizer: que as consultas do transporte existem, que o
 * formato do manifesto é o esperado, e — o que mais importa — que **o
 * espelho herda a RLS**. Um aparelho só guarda o que aquele login enxerga.
 *
 * O espelho é um `Armazem` em memória: aqui não há IndexedDB.
 */

const TABELAS = [
  "tags",
  "visa_types",
  "document_types",
  "stage_statuses",
  "organizations",
  "organization_members",
];

function armazemEmMemoria(): Armazem & { dados: Record<string, Map<string, Linha>> } {
  const dados: Record<string, Map<string, Linha>> = {};
  const marcas = new Map<string, string>();
  const t = (nome: string) => (dados[nome] ??= new Map());

  return {
    dados,
    async gravar(tabela, linhas) {
      // Neste armazém de teste a chave é o `id`; `person_tags`, que não tem
      // um, não entra em nenhum destes testes.
      for (const l of linhas) t(tabela).set(String(l.id), l);
    },
    async apagar(tabela, ids) {
      for (const id of ids) t(tabela).delete(id);
    },
    async substituir(tabela, linhas) {
      dados[tabela] = new Map(linhas.map((l) => [String(l.id), l]));
    },
    async contar(tabela) {
      return t(tabela).size;
    },
    async marca(tabela) {
      return marcas.get(tabela) ?? null;
    },
    async definirMarca(tabela, valor) {
      if (valor) marcas.set(tabela, valor);
    },
  };
}

describe("espelho contra o banco", () => {
  let parceiro: Cliente;
  let duli: Cliente;
  let org: string;
  const criadas: string[] = [];

  beforeAll(async () => {
    parceiro = await entrarComo("parceiro");
    duli = await entrarComo("colaborador");
    const { data, error } = await parceiro
      .from("organization_members")
      .select("organization_id")
      .limit(1)
      .single();
    if (error) throw new Error(`Organização ilegível: ${error.message}`);
    org = data.organization_id;
  }, 60_000);

  afterAll(async () => {
    if (criadas.length) await parceiro.from("tags").delete().in("id", criadas);
  });

  it("o aparelho do parceiro guarda só o que o parceiro enxerga", async () => {
    // A garantia central: o espelho é cópia do que o servidor **devolveu**
    // àquele login. Nenhum caminho novo de leitura foi criado.
    const doParceiro = armazemEmMemoria();
    const daDuli = armazemEmMemoria();

    await sincronizar(transporteSupabase(parceiro), doParceiro, TABELAS);
    await sincronizar(transporteSupabase(duli), daDuli, TABELAS);

    const vistosDoParceiro = [...doParceiro.dados.visa_types.values()].map((v) => v.name);
    const vistosDaDuli = [...daDuli.dados.visa_types.values()].map((v) => v.name);

    expect(vistosDoParceiro).toEqual(["Visto do Parceiro"]);
    expect(vistosDaDuli).not.toContain("Visto do Parceiro");
    expect(daDuli.dados.visa_types.size).toBeGreaterThan(0);
  }, 60_000);

  it("o vínculo que o aparelho guarda é o que aquele login enxerga", async () => {
    // É deste par que sai a organização das gravações feitas offline. Se o
    // espelho do parceiro trouxesse a organização da Duli, uma tag criada no
    // avião poderia nascer na organização errada — e a RLS não recusaria,
    // porque a linha é válida.
    const doParceiro = armazemEmMemoria();
    await sincronizar(transporteSupabase(parceiro), doParceiro, TABELAS);

    const orgs = [...doParceiro.dados.organizations.values()].map((o) => o.id);
    const vinculos = [...doParceiro.dados.organization_members.values()];

    expect(orgs).toEqual([org]);
    expect(vinculos.length).toBeGreaterThan(0);
    expect(vinculos.every((v) => v.organization_id === org)).toBe(true);
  }, 60_000);

  it("a segunda sincronia traz o que mudou no meio", async () => {
    const espelho = armazemEmMemoria();
    await sincronizar(transporteSupabase(parceiro), espelho, TABELAS);
    const antes = espelho.dados.tags.size;

    const { data, error } = await parceiro
      .from("tags")
      .insert({ organization_id: org, name: `Tag do espelho ${Date.now()}` })
      .select("id")
      .single();
    if (error) throw new Error(`Tag não criada: ${error.message}`);
    criadas.push(data.id);

    const resultado = await sincronizar(transporteSupabase(parceiro), espelho, TABELAS);

    expect(resultado.error).toBeNull();
    expect(espelho.dados.tags.size).toBe(antes + 1);
    expect(espelho.dados.tags.get(data.id)).toBeDefined();
  }, 60_000);

  it("o que foi apagado no servidor sai do aparelho", async () => {
    const espelho = armazemEmMemoria();
    const { data } = await parceiro
      .from("tags")
      .insert({ organization_id: org, name: `Tag efêmera ${Date.now()}` })
      .select("id")
      .single();

    await sincronizar(transporteSupabase(parceiro), espelho, TABELAS);
    expect(espelho.dados.tags.get(data!.id)).toBeDefined();

    await parceiro.from("tags").delete().eq("id", data!.id);
    const resultado = await sincronizar(transporteSupabase(parceiro), espelho, TABELAS);

    expect(resultado.error).toBeNull();
    expect(espelho.dados.tags.get(data!.id)).toBeUndefined();
  }, 60_000);

  it("a contagem do manifesto bate com o que o aparelho guardou", async () => {
    // Se isto falhar, a conferência mandaria recarregar a toda sincronia —
    // custo desnecessário e sinal de que a lista de tabelas divergiu.
    const espelho = armazemEmMemoria();
    const resultado = await sincronizar(transporteSupabase(parceiro), espelho, TABELAS);
    const segunda = await sincronizar(transporteSupabase(parceiro), espelho, TABELAS);

    expect(resultado.error).toBeNull();
    expect(segunda.recarregadas).toEqual([]);
  }, 60_000);
});
