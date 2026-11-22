// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resumoDoGanhoSchema } from "@/features/opportunities/schema";
import { somarMeses } from "@/lib/parcelas";

import { entrarComo, fixture, type Cliente } from "./clientes";

/**
 * As cobranças no Ganho (0059; REC-6, CRM-14).
 *
 * Com a forma confirmada, `ganhar_negocio` cria uma cobrança por parte, com a
 * organização da pessoa, e grava `charges_created_at`: a forma não gera de
 * novo. O resumo (`p_simular`) e a gravação saem da mesma função
 * (`private.forma_do_ganho`), então prometem as mesmas cobranças.
 *
 * Tudo em pessoas descartáveis da organização de teste, apagadas no fim (a
 * cascata leva negócio, forma, processos e cobranças).
 */

const s = crypto.randomUUID().replace(/-/g, "").slice(0, 8);

const MSG = {
  cobrancasCriadas:
    "As cobranças já foram criadas. Para mudar, exclua a cobrança e crie outra na aba Financeiro do cliente.",
  encerrado: "O negócio está encerrado; reabra para mexer na forma de pagamento.",
};

function hojeMais(dias: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const ENTRADA = (due_on = hojeMais(10)) => ({
  label: "Entrada",
  method: "pix",
  currency: "BRL",
  total: 10000,
  installments_count: 1,
  parcelas: [{ number: 1, amount: 10000, due_on }],
});

const PARCELAS = () => {
  const primeira = somarMeses(hojeMais(0), 1);
  return {
    label: "Parcelas",
    method: "transferencia",
    currency: "USD",
    total: 9000,
    installments_count: 3,
    parcelas: [0, 1, 2].map((i) => ({ number: i + 1, amount: 3000, due_on: somarMeses(primeira, i) })),
  };
};

const CRITERIO = () => ({ partes: [ENTRADA(), PARCELAS()] });

const lerResumo = (data: unknown) => resumoDoGanhoSchema.parse(data);

describe("cobranças no Ganho (0059)", { timeout: 60_000 }, () => {
  let parceiro: Cliente;
  let staff: Cliente;
  let parceiroId: string;
  let staffId: string;
  let org: string;
  let funilId: string;
  let primeiraAberta: string;
  let vistoId: string;
  const criadas: string[] = [];
  let contador = 0;

  async function novaPessoa(): Promise<string> {
    contador += 1;
    const { data, error } = await parceiro
      .from("people")
      .insert({ organization_id: org, full_name: `Cobrança ${s} ${contador}`, lifecycle_stage: "opportunity" })
      .select("id")
      .single();
    if (error) throw new Error(`Pessoa descartável não criada: ${error.message}`);
    criadas.push(data.id);
    return data.id;
  }

  async function novoNegocio(pessoaId: string, donoId: string, quem: Cliente = parceiro): Promise<string> {
    const { data, error } = await quem
      .from("opportunities")
      .insert({
        organization_id: org,
        person_id: pessoaId,
        pipeline_id: funilId,
        stage_id: primeiraAberta,
        title: `Negócio ${s}`,
        owner_id: donoId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Negócio não criado: ${error.message}`);
    return data.id;
  }

  async function novoItem(negocioId: string, visaName: string, extra: Record<string, unknown> = {}) {
    const { error } = await parceiro.from("opportunity_items").insert({
      organization_id: org,
      opportunity_id: negocioId,
      visa_type_id: vistoId,
      visa_name: visaName,
      amount: 8000,
      currency: "USD",
      ...extra,
    });
    return error;
  }

  async function comVistos(negocioId: string, posicaoDoSegundo = 1) {
    const a = await novoItem(negocioId, "EB-1A", { position: 0 });
    const b = await novoItem(negocioId, "O-1", { position: posicaoDoSegundo, amount: 6000 });
    if (a || b) throw new Error(`Itens não criados: ${a?.message ?? b?.message}`);
  }

  const salvar = (quem: Cliente, negocioId: string, forma: unknown) =>
    quem.rpc("salvar_forma_de_pagamento", { p_negocio: negocioId, p_forma: forma as never });
  const confirmar = (quem: Cliente, negocioId: string) =>
    quem.rpc("confirmar_forma_de_pagamento_pela_equipe", { p_negocio: negocioId });
  const refazer = (quem: Cliente, negocioId: string) =>
    quem.rpc("voltar_forma_para_rascunho", { p_negocio: negocioId });
  const ganhar = (quem: Cliente, negocioId: string, simular = false) =>
    quem.rpc("ganhar_negocio", { p_negocio: negocioId, p_simular: simular });
  const reabrir = (quem: Cliente, negocioId: string) =>
    quem.rpc("reabrir_negocio", { p_negocio: negocioId });

  async function cobrancasDa(pessoaId: string) {
    const { data, error } = await parceiro
      .from("receivables")
      .select("id, organization_id, project_id, payment_plan_part_id, title, amount, currency")
      .eq("person_id", pessoaId)
      .order("title");
    if (error) throw new Error(`Cobranças ilegíveis: ${error.message}`);
    return data;
  }

  async function parcelasDas(cobrancaIds: string[]) {
    const { data, error } = await parceiro
      .from("installments")
      .select("receivable_id, number, amount, due_on, method")
      .in("receivable_id", cobrancaIds)
      .order("number");
    if (error) throw new Error(`Parcelas ilegíveis: ${error.message}`);
    return data;
  }

  async function formaDo(negocioId: string) {
    const { data, error } = await parceiro
      .from("payment_plans")
      .select("id, status, charges_created_at")
      .eq("opportunity_id", negocioId)
      .single();
    if (error) throw new Error(`Forma ilegível: ${error.message}`);
    return data;
  }

  /** Pessoa, negócio do parceiro com EB-1A e O-1, a forma salva e confirmada. */
  async function confirmado(forma: unknown = CRITERIO()) {
    const pessoa = await novaPessoa();
    const negocio = await novoNegocio(pessoa, parceiroId);
    await comVistos(negocio);
    const salvo = await salvar(parceiro, negocio, forma);
    if (salvo.error) throw new Error(`Forma não salva: ${salvo.error.message}`);
    const ok = await confirmar(parceiro, negocio);
    if (ok.error) throw new Error(`Forma não confirmada: ${ok.error.message}`);
    return { pessoa, negocio };
  }

  beforeAll(async () => {
    [parceiro, staff] = await Promise.all([entrarComo("parceiro"), entrarComo("staff")]);
    parceiroId = (await parceiro.auth.getUser()).data.user!.id;
    staffId = (await staff.auth.getUser()).data.user!.id;
    org = (await fixture(parceiro)).organization_id;

    const { data: funil, error: erroFunil } = await parceiro
      .from("pipelines")
      .select("id")
      .eq("organization_id", org)
      .eq("is_default", true)
      .single();
    if (erroFunil) throw new Error(`Funil ilegível: ${erroFunil.message}`);
    funilId = funil.id;

    const { data: etapas, error: erroEtapas } = await parceiro
      .from("pipeline_stages")
      .select("id, is_won, is_lost, position")
      .eq("pipeline_id", funilId);
    if (erroEtapas) throw new Error(`Etapas ilegíveis: ${erroEtapas.message}`);
    primeiraAberta = etapas
      .filter((e) => !e.is_won && !e.is_lost)
      .sort((a, b) => a.position - b.position)[0]!.id;

    const { data: visto, error: erroVisto } = await parceiro
      .from("visa_types")
      .select("id")
      .eq("name", "Visto do Parceiro")
      .maybeSingle();
    if (erroVisto) throw new Error(`Visto da fixture ilegível: ${erroVisto.message}`);
    if (!visto) throw new Error("Visto da fixture não existe. Aplique a 0021.");
    vistoId = visto.id;
  }, 60_000);

  afterAll(async () => {
    if (criadas.length) await parceiro.from("people").delete().in("id", criadas);
  });

  it("forma confirmada: o resumo e a gravação trazem as mesmas 2 cobranças, da pessoa", async () => {
    const { pessoa, negocio } = await confirmado();

    const simulado = await ganhar(parceiro, negocio, true);
    expect(simulado.error).toBeNull();
    const resumo = lerResumo(simulado.data);
    expect(resumo.forma.situacao).toBe("confirmada");
    expect(resumo.forma.confirmada_por).toBeTruthy();
    expect(resumo.forma.confirmada_em).toBeTruthy();
    expect(resumo.forma.partes).toHaveLength(2);
    const prometidas = resumo.cobrancas.map(({ titulo, moeda, total, parcelas }) => ({ titulo, moeda, total, parcelas }));
    expect(prometidas).toEqual([
      { titulo: "Entrada — EB-1A, O-1", moeda: "BRL", total: 10000, parcelas: 1 },
      { titulo: "Parcelas — EB-1A, O-1", moeda: "USD", total: 9000, parcelas: 3 },
    ]);
    expect(resumo.cobrancas.every((c) => c.id === null)).toBe(true);
    expect(await cobrancasDa(pessoa)).toHaveLength(0);

    const gravado = await ganhar(parceiro, negocio);
    expect(gravado.error).toBeNull();
    const feito = lerResumo(gravado.data);
    expect(feito.cobrancas.map(({ titulo, moeda, total, parcelas }) => ({ titulo, moeda, total, parcelas }))).toEqual(
      prometidas,
    );
    expect(feito.cobrancas.every((c) => c.id)).toBe(true);

    const cobrancas = await cobrancasDa(pessoa);
    expect(cobrancas.map((c) => c.title)).toEqual(["Entrada — EB-1A, O-1", "Parcelas — EB-1A, O-1"]);
    for (const c of cobrancas) {
      expect(c.organization_id).toBe(org);
      expect(c.project_id).toBeNull();
      expect(c.payment_plan_part_id).toBeTruthy();
    }
    expect(cobrancas.map((c) => c.id).sort()).toEqual(feito.cobrancas.map((c) => c.id).sort());

    const parcelas = await parcelasDas(cobrancas.map((c) => c.id));
    const daEntrada = parcelas.filter((p) => p.receivable_id === cobrancas[0]!.id);
    const dasParcelas = parcelas.filter((p) => p.receivable_id === cobrancas[1]!.id);
    expect(daEntrada).toEqual([
      { receivable_id: cobrancas[0]!.id, number: 1, amount: 10000, due_on: ENTRADA().parcelas[0]!.due_on, method: "pix" },
    ]);
    expect(dasParcelas.map((p) => [p.number, p.amount, p.due_on, p.method])).toEqual(
      PARCELAS().parcelas.map((p) => [p.number, p.amount, p.due_on, "transferencia"]),
    );

    expect((await formaDo(negocio)).charges_created_at).not.toBeNull();
  });

  it("cartão vira uma cobrança de uma parcela, com o método cartão", async () => {
    const { pessoa, negocio } = await confirmado({
      partes: [
        {
          label: "Cartão",
          method: "cartao",
          currency: "USD",
          total: 9000,
          installments_count: 1,
          parcelas: [{ number: 1, amount: 9000, due_on: hojeMais(5) }],
        },
      ],
    });

    expect((await ganhar(parceiro, negocio)).error).toBeNull();
    const [cobranca, ...outras] = await cobrancasDa(pessoa);
    expect(outras).toHaveLength(0);
    expect(cobranca!.title).toBe("Cartão — EB-1A, O-1");
    expect(await parcelasDas([cobranca!.id])).toEqual([
      { receivable_id: cobranca!.id, number: 1, amount: 9000, due_on: hojeMais(5), method: "cartao" },
    ]);
  });

  it("forma em rascunho ou sem forma: nenhuma cobrança, e o resumo diz qual", async () => {
    const pessoa = await novaPessoa();
    const rascunho = await novoNegocio(pessoa, parceiroId);
    await comVistos(rascunho);
    expect((await salvar(parceiro, rascunho, CRITERIO())).error).toBeNull();

    const resumo = lerResumo((await ganhar(parceiro, rascunho, true)).data);
    expect(resumo.forma.situacao).toBe("rascunho");
    expect(resumo.cobrancas).toEqual([]);
    expect((await ganhar(parceiro, rascunho)).error).toBeNull();
    expect(await cobrancasDa(pessoa)).toHaveLength(0);
    expect((await formaDo(rascunho)).charges_created_at).toBeNull();

    const outra = await novaPessoa();
    const semForma = await novoNegocio(outra, parceiroId);
    await comVistos(semForma);
    const vazio = lerResumo((await ganhar(parceiro, semForma, true)).data);
    expect(vazio.forma).toMatchObject({ situacao: "sem_forma", partes: [] });
    expect(vazio.cobrancas).toEqual([]);
  });

  it("reabrir e ganhar de novo: nenhuma cobrança nova; a forma vira registro (REC-6, CRM-15)", async () => {
    const { pessoa, negocio } = await confirmado();
    expect((await ganhar(parceiro, negocio)).error).toBeNull();
    expect((await reabrir(parceiro, negocio)).error).toBeNull();

    expect((await refazer(parceiro, negocio)).error?.message).toBe(MSG.cobrancasCriadas);
    expect((await salvar(parceiro, negocio, CRITERIO())).error?.message).toBe(MSG.cobrancasCriadas);
    expect((await confirmar(parceiro, negocio)).error?.message).toBe(MSG.cobrancasCriadas);

    const resumo = lerResumo((await ganhar(parceiro, negocio, true)).data);
    expect(resumo.forma.situacao).toBe("cobrancas_criadas");
    expect(resumo.forma.cobrancas_criadas_em).toBeTruthy();
    expect(resumo.cobrancas).toEqual([]);

    // A trava dos vistos acabou com as cobranças: o negócio reaberto aceita visto.
    expect(await novoItem(negocio, "EB-2 NIW", { position: 2 })).toBeNull();
    const segundo = lerResumo((await ganhar(parceiro, negocio)).data);
    expect(segundo.processos.map((p) => p.titulo)).toEqual([expect.stringMatching(/^EB-2 NIW — /)]);
    expect(await cobrancasDa(pessoa)).toHaveLength(2);

    const forma = await formaDo(negocio);
    expect(
      (await parceiro.from("payment_plans").update({ charges_created_at: null }).eq("id", forma.id)).error,
    ).not.toBeNull();
  });

  it("parcela vencida não segura o Ganho, e o resumo traz a data", async () => {
    const ontem = hojeMais(-1);
    const { pessoa, negocio } = await confirmado({ partes: [ENTRADA(ontem)] });

    const resumo = lerResumo((await ganhar(parceiro, negocio, true)).data);
    expect(resumo.forma.partes[0]!.parcelas[0]!.due_on).toBe(ontem);

    expect((await ganhar(parceiro, negocio)).error).toBeNull();
    const [cobranca] = await cobrancasDa(pessoa);
    expect((await parcelasDas([cobranca!.id]))[0]!.due_on).toBe(ontem);
  });

  it("o dono do negócio que não é da gestão confirma e ganha: as cobranças nascem", async () => {
    // O caminho mais comum: um colaborador dono do negócio. O passo (7) precisa
    // das policies de membro em payment_plans, receivables e installments.
    const pessoa = await novaPessoa();
    const negocio = await novoNegocio(pessoa, staffId, staff);
    await comVistos(negocio);
    expect((await salvar(staff, negocio, CRITERIO())).error).toBeNull();
    expect((await confirmar(staff, negocio)).error).toBeNull();

    const gravado = await ganhar(staff, negocio);
    expect(gravado.error).toBeNull();
    expect(lerResumo(gravado.data).cobrancas.every((c) => c.id)).toBe(true);

    const cobrancas = await cobrancasDa(pessoa);
    expect(cobrancas.map((c) => c.title)).toEqual(["Entrada — EB-1A, O-1", "Parcelas — EB-1A, O-1"]);
    expect((await parcelasDas(cobrancas.map((c) => c.id))).length).toBe(4);
    expect((await formaDo(negocio)).charges_created_at).not.toBeNull();
  });

  it("depois de Refazer e confirmar de novo, o resumo traz a segunda confirmação", async () => {
    const pessoa = await novaPessoa();
    const negocio = await novoNegocio(pessoa, staffId, staff);
    await comVistos(negocio);
    expect((await salvar(staff, negocio, CRITERIO())).error).toBeNull();
    expect((await confirmar(staff, negocio)).error).toBeNull();
    expect((await refazer(staff, negocio)).error).toBeNull();
    expect((await confirmar(parceiro, negocio)).error).toBeNull();

    const forma = await formaDo(negocio);
    const { data: respostas, error } = await parceiro
      .from("payment_plan_responses")
      .select("answered_at, answered_by, answered_by_name")
      .eq("plan_id", forma.id)
      .order("answered_at");
    if (error) throw new Error(error.message);
    expect(respostas.map((r) => r.answered_by)).toEqual([staffId, parceiroId]);

    const resumo = lerResumo((await ganhar(parceiro, negocio, true)).data);
    expect(resumo.forma.confirmada_por).toBe(respostas[1]!.answered_by_name);
    expect(new Date(resumo.forma.confirmada_em!).getTime()).toBe(new Date(respostas[1]!.answered_at).getTime());
  });

  it("negócio ganho: a forma não muda, a cotação sim (FIC-11)", async () => {
    const pessoa = await novaPessoa();
    const rascunho = await novoNegocio(pessoa, parceiroId);
    await comVistos(rascunho);
    expect((await salvar(parceiro, rascunho, CRITERIO())).error).toBeNull();
    expect((await ganhar(parceiro, rascunho)).error).toBeNull();
    expect((await salvar(parceiro, rascunho, CRITERIO())).error?.message).toBe(MSG.encerrado);
    expect((await confirmar(parceiro, rascunho)).error?.message).toBe(MSG.encerrado);

    const { negocio } = await confirmado();
    expect((await ganhar(parceiro, negocio)).error).toBeNull();
    const forma = await formaDo(negocio);
    expect(
      (await parceiro.from("payment_plans").update({ reference_rate: 5.42 }).eq("id", forma.id)).error,
    ).toBeNull();
  });

  it("vistos com a mesma posição: o título segue a ordem de criação (foco 5)", async () => {
    const pessoa = await novaPessoa();
    const negocio = await novoNegocio(pessoa, parceiroId);
    await comVistos(negocio, 0);
    expect((await salvar(parceiro, negocio, { partes: [ENTRADA()] })).error).toBeNull();
    expect((await confirmar(parceiro, negocio)).error).toBeNull();

    const resumo = lerResumo((await ganhar(parceiro, negocio, true)).data);
    expect(resumo.cobrancas.map((c) => c.titulo)).toEqual(["Entrada — EB-1A, O-1"]);
  });
});
