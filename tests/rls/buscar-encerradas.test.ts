// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { entrarComo, fixture, type Cliente } from "./clientes";

/**
 * CRM › Encerradas (0053; CRM-16): ganhas e perdidas, com busca por título ou
 * contato, filtro ganha/perdida, o total do filtro e os totais por moeda.
 *
 * Cada nome e título leva o sufixo aleatório `s`, e toda busca o inclui: o
 * que outros testes deixam na organização de teste não entra na conta.
 */

const s = crypto.randomUUID().replace(/-/g, "").slice(0, 8);

type Linha = {
  id: string;
  title: string;
  status: string;
  closed_at: string | null;
  person_id: string;
  full_name: string;
  totais: { currency: string; amount: number }[];
  total: number;
};

describe("buscar_encerradas (0053)", () => {
  let parceiro: Cliente;
  let duli: Cliente;
  let parceiroId: string;
  let org: string;
  let funilId: string;
  let abertaId: string;
  let perdidoId: string;
  let vistoId: string;
  const criadas: string[] = [];
  const negocios: Record<string, string> = {};

  async function pessoa(nome: string): Promise<string> {
    const { data, error } = await parceiro
      .from("people")
      .insert({ organization_id: org, full_name: nome, lifecycle_stage: "opportunity" })
      .select("id")
      .single();
    if (error) throw new Error(`Pessoa não criada: ${error.message}`);
    criadas.push(data.id);
    return data.id;
  }

  async function negocio(pessoaId: string, titulo: string): Promise<string> {
    const { data, error } = await parceiro
      .from("opportunities")
      .insert({
        organization_id: org,
        person_id: pessoaId,
        pipeline_id: funilId,
        stage_id: abertaId,
        title: titulo,
        owner_id: parceiroId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Negócio não criado: ${error.message}`);
    return data.id;
  }

  async function item(negocioId: string, nome: string, amount: number, currency: string) {
    const { error } = await parceiro.from("opportunity_items").insert({
      organization_id: org,
      opportunity_id: negocioId,
      visa_type_id: vistoId,
      visa_name: nome,
      amount,
      currency,
    });
    if (error) throw new Error(`Item não criado: ${error.message}`);
  }

  /** Perdido pelo `update` direto, como a tela faz (nenhuma trava guarda a perda). */
  async function perder(negocioId: string) {
    const { error } = await parceiro
      .from("opportunities")
      .update({ status: "lost", stage_id: perdidoId, closed_at: new Date().toISOString() })
      .eq("id", negocioId);
    if (error) throw new Error(`Perda falhou: ${error.message}`);
  }

  const buscar = async (
    quem: Cliente,
    args: { p_busca?: string; p_situacao?: string; p_limite?: number },
  ) => {
    const { data, error } = await quem.rpc("buscar_encerradas", args);
    return { linhas: (data ?? []) as unknown as Linha[], error };
  };

  beforeAll(async () => {
    [parceiro, duli] = await Promise.all([entrarComo("parceiro"), entrarComo("colaborador")]);
    parceiroId = (await parceiro.auth.getUser()).data.user!.id;
    org = (await fixture(parceiro)).organization_id;

    const { data: funil } = await parceiro
      .from("pipelines")
      .select("id")
      .eq("organization_id", org)
      .eq("is_default", true)
      .single();
    funilId = funil!.id;
    const { data: etapas } = await parceiro
      .from("pipeline_stages")
      .select("id, is_won, is_lost, position")
      .eq("pipeline_id", funilId);
    abertaId = etapas!
      .filter((e) => !e.is_won && !e.is_lost)
      .sort((a, b) => a.position - b.position)[0]!.id;
    perdidoId = etapas!.find((e) => e.is_lost)!.id;

    const { data: visto } = await parceiro
      .from("visa_types")
      .select("id")
      .eq("name", "Visto do Parceiro")
      .single();
    vistoId = visto!.id;

    const maria = await pessoa(`Encerradas ${s} Maria`);
    const joao = await pessoa(`Encerradas ${s} João`);

    // Ganha pela função, com três itens em duas moedas.
    negocios.alfa = await negocio(maria, `Venda ${s} alfa`);
    await item(negocios.alfa, "EB-1A", 8000, "USD");
    await item(negocios.alfa, "O-1", 6000, "USD");
    await item(negocios.alfa, "Consultoria", 1000, "BRL");
    const ganho = await parceiro.rpc("ganhar_negocio", { p_negocio: negocios.alfa });
    if (ganho.error) throw new Error(`Ganho falhou: ${ganho.error.message}`);

    negocios.beta = await negocio(joao, `Venda ${s} beta`);
    await perder(negocios.beta);

    // Aberto: nunca aparece.
    negocios.gama = await negocio(maria, `Venda ${s} gama`);

    // `%` e `_` literais.
    negocios.cemPorCento = await negocio(joao, `Desconto ${s} 100%`);
    negocios.mil = await negocio(joao, `Desconto ${s} 1000`);
    negocios.aSublinhadoB = await negocio(joao, `Plano ${s} a_b`);
    negocios.axb = await negocio(joao, `Plano ${s} axb`);
    for (const chave of ["cemPorCento", "mil", "aSublinhadoB", "axb"]) {
      await perder(negocios[chave]!);
    }
  }, 120_000);

  afterAll(async () => {
    if (criadas.length) await parceiro.from("people").delete().in("id", criadas);
  });

  it("acha pelo título", async () => {
    const { linhas, error } = await buscar(parceiro, { p_busca: `Venda ${s} alfa` });
    expect(error).toBeNull();
    expect(linhas.map((l) => l.id)).toEqual([negocios.alfa]);
    expect(linhas[0]).toMatchObject({ status: "won", full_name: `Encerradas ${s} Maria` });
  });

  it("acha pelo nome do contato", async () => {
    const { linhas } = await buscar(parceiro, { p_busca: `${s} João`, p_situacao: "won" });
    expect(linhas).toEqual([]);
    const { linhas: perdidas } = await buscar(parceiro, { p_busca: `${s} João` });
    expect(perdidas.map((l) => l.id)).toContain(negocios.beta);
  });

  it("% e _ são literais", async () => {
    const cem = await buscar(parceiro, { p_busca: `${s} 100%` });
    expect(cem.linhas.map((l) => l.id)).toEqual([negocios.cemPorCento]);

    const sublinhado = await buscar(parceiro, { p_busca: `${s} a_b` });
    expect(sublinhado.linhas.map((l) => l.id)).toEqual([negocios.aSublinhadoB]);
  });

  it("filtra ganha e perdida", async () => {
    const ganhas = await buscar(parceiro, { p_busca: s, p_situacao: "won" });
    expect(ganhas.linhas.map((l) => l.id)).toEqual([negocios.alfa]);

    const perdidas = await buscar(parceiro, { p_busca: s, p_situacao: "lost" });
    const ids = perdidas.linhas.map((l) => l.id);
    expect(ids).toHaveLength(5);
    expect(ids).not.toContain(negocios.alfa);
    expect(perdidas.linhas.every((l) => l.status === "lost")).toBe(true);
  });

  it("situação fora de won e lost é recusada", async () => {
    const { error } = await buscar(parceiro, { p_busca: s, p_situacao: "open" });
    expect(error?.code).toBe("22023");
  });

  it("não traz negócio aberto, nem de outra organização", async () => {
    const aberto = await buscar(parceiro, { p_busca: `Venda ${s} gama` });
    expect(aberto.error).toBeNull();
    expect(aberto.linhas).toEqual([]);

    const daDuli = await buscar(duli, { p_busca: s });
    expect(daDuli.error).toBeNull();
    expect(daDuli.linhas).toEqual([]);
  });

  it("total é o do filtro, não o da página", async () => {
    const { linhas } = await buscar(parceiro, { p_busca: s, p_limite: 2 });
    expect(linhas).toHaveLength(2);
    expect(Number(linhas[0]!.total)).toBe(6);
  });

  it("totais somam por moeda, sem misturar", async () => {
    const { linhas } = await buscar(parceiro, { p_busca: `Venda ${s} alfa` });
    expect(linhas[0]!.totais).toEqual([
      { currency: "BRL", amount: 1000 },
      { currency: "USD", amount: 14000 },
    ]);
  });
});
