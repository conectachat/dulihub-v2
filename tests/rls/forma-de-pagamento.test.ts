// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { somarMeses } from "@/lib/parcelas";

import { entrarComo, fixture, type Cliente } from "./clientes";

/**
 * A forma de pagamento no banco (0058; FIC-7, FIC-10, FIC-11, FIC-12).
 *
 * A forma só muda pelas três funções (`salvar_forma_de_pagamento`,
 * `confirmar_forma_de_pagamento_pela_equipe`, `voltar_forma_para_rascunho`),
 * que ligam a marca `via_forma`; a cotação é a única coluna que a equipe grava
 * direto. A confirmação guarda uma cópia que não se altera nem se apaga; com a
 * forma confirmada, os vistos do negócio travam até o Ganho criar as cobranças.
 *
 * Tudo em pessoas descartáveis da organização de teste, apagadas no fim (a
 * cascata leva negócio, forma, partes, parcelas, respostas e histórico). O
 * negócio criado no "Cliente de Teste" (portal) só tem forma em rascunho e é
 * apagado em `finally`: negócio com confirmação não se apaga.
 */

const s = crypto.randomUUID().replace(/-/g, "").slice(0, 8);

const MSG = {
  naoEncontrado: "Negócio não encontrado.",
  confirmada: "A forma está confirmada. Use Refazer para mudar.",
  encerrado: "O negócio está encerrado; reabra para mexer na forma de pagamento.",
  semParteOuVisto: "Acrescente pelo menos um visto e uma parte antes de confirmar.",
  semPoder: "Só o dono do negócio ou a gestão confirmam a forma de pagamento.",
  // 0064: quem clica diz de que estado parte; diferente do atual, esta frase.
  mudou: "A forma de pagamento mudou enquanto você olhava. Atualize a página.",
  soma: "As parcelas de Parcelas não somam o total.",
  casas: "Use no máximo 2 casas decimais em Parcelas.",
  lista: "O número de parcelas de Parcelas não bate com a lista.",
  limiteParcelas: "Parcelas vão de 1 a 36.",
  cartao: "Cartão é um pagamento só, numa data.",
  onzePartes: "A forma vai até 10 partes.",
  rotulo: "Dê um nome à parte, com até 80 caracteres.",
  data: "A data da parcela 1 de Parcelas não é válida.",
  limiteValor: "O valor de Parcelas passa do limite.",
  formato: "A forma de pagamento veio num formato inválido.",
  observacao: "A observação vai até 500 caracteres.",
  vistos: "A forma de pagamento está confirmada. Use Refazer para mudar os vistos.",
  excluir: "A forma de pagamento já foi confirmada; o negócio fica como registro.",
  parteSoNoGanho: "A cobrança da forma de pagamento só nasce no Ganho.",
};

/** Hoje no fuso de São Paulo, mais `dias`, como `AAAA-MM-DD`. */
function hojeMais(dias: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

type Parcela = { number: number; amount: number; due_on: string };
type Parte = {
  label: string;
  method: string;
  currency: string;
  total: number;
  installments_count: number;
  parcelas: Parcela[];
};

const ENTRADA = (): Parte => ({
  label: "Entrada",
  method: "pix",
  currency: "BRL",
  total: 10000,
  installments_count: 1,
  parcelas: [{ number: 1, amount: 10000, due_on: hojeMais(10) }],
});

const PARCELAS = (): Parte => {
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

/** A forma do critério: entrada de R$ 10.000 + 3 × US$ 3.000. */
const CRITERIO = () => ({ partes: [ENTRADA(), PARCELAS()] });

// Cada caso faz de 10 a 20 chamadas ao banco de verdade; com a suíte inteira
// rodando, os 15 s padrão não bastam (como os `beforeAll` da casa, 60 s).
describe("forma de pagamento no banco (0058)", { timeout: 60_000 }, () => {
  let parceiro: Cliente;
  let staff: Cliente;
  let duli: Cliente;
  let cliente: Cliente;
  let parceiroId: string;
  let staffId: string;
  let org: string;
  let fixturePessoa: string;
  let funilId: string;
  let primeiraAberta: string;
  let perdaId: string;
  let vistoId: string;
  const criadas: string[] = [];
  const vistosCriados: string[] = [];
  let contador = 0;

  async function novaPessoa(): Promise<string> {
    contador += 1;
    const { data, error } = await parceiro
      .from("people")
      .insert({ organization_id: org, full_name: `Forma ${s} ${contador}`, lifecycle_stage: "opportunity" })
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
    return parceiro
      .from("opportunity_items")
      .insert({
        organization_id: org,
        opportunity_id: negocioId,
        visa_type_id: vistoId,
        visa_name: visaName,
        amount: 8000,
        currency: "USD",
        ...extra,
      })
      .select("id")
      .single();
  }

  async function comVistos(negocioId: string) {
    const a = await novoItem(negocioId, "EB-1A", { position: 0 });
    const b = await novoItem(negocioId, "O-1", { position: 1, amount: 6000 });
    if (a.error || b.error) throw new Error(`Itens não criados: ${a.error?.message ?? b.error?.message}`);
    return [a.data.id, b.data.id];
  }

  const salvar = (quem: Cliente, negocioId: string, forma: unknown) =>
    quem.rpc("salvar_forma_de_pagamento", { p_negocio: negocioId, p_forma: forma as never });

  const confirmar = (quem: Cliente, negocioId: string, observacao?: string) =>
    quem.rpc(
      "confirmar_forma_de_pagamento_pela_equipe",
      observacao === undefined ? { p_negocio: negocioId } : { p_negocio: negocioId, p_observacao: observacao },
    );

  const refazer = (quem: Cliente, negocioId: string) =>
    quem.rpc("voltar_forma_para_rascunho", { p_negocio: negocioId });

  async function formaDo(negocioId: string, quem: Cliente = parceiro) {
    const { data, error } = await quem
      .from("payment_plans")
      .select("id, status, reference_rate, reference_rate_note, charges_created_at")
      .eq("opportunity_id", negocioId)
      .maybeSingle();
    if (error) throw new Error(`Forma ilegível: ${error.message}`);
    return data;
  }

  async function partesDa(planoId: string, quem: Cliente = parceiro) {
    const { data, error } = await quem
      .from("payment_plan_parts")
      .select("id, position, label")
      .eq("plan_id", planoId)
      .order("position");
    if (error) throw new Error(`Partes ilegíveis: ${error.message}`);
    return data;
  }

  async function parcelasDas(parteIds: string[], quem: Cliente = parceiro) {
    const { data, error } = await quem
      .from("payment_plan_installments")
      .select("id, part_id, number, amount, due_on")
      .in("part_id", parteIds);
    if (error) throw new Error(`Parcelas ilegíveis: ${error.message}`);
    return data;
  }

  async function respostasDa(planoId: string, quem: Cliente = parceiro) {
    const { data, error } = await quem
      .from("payment_plan_responses")
      .select("id, decision, reason, answered_by, answered_by_name, registration_form_id, snapshot")
      .eq("plan_id", planoId);
    if (error) throw new Error(`Respostas ilegíveis: ${error.message}`);
    return data;
  }

  async function historico(pessoaId: string) {
    const { data, error } = await parceiro
      .from("activities")
      .select("type, description")
      .eq("person_id", pessoaId);
    if (error) throw new Error(`Histórico ilegível: ${error.message}`);
    return data;
  }

  /** Pessoa, negócio do parceiro com EB-1A e O-1, e a forma do critério salva. */
  async function negocioComForma() {
    const pessoa = await novaPessoa();
    const negocio = await novoNegocio(pessoa, parceiroId);
    await comVistos(negocio);
    const { error } = await salvar(parceiro, negocio, CRITERIO());
    if (error) throw new Error(`Forma não salva: ${error.message}`);
    const forma = (await formaDo(negocio))!;
    return { pessoa, negocio, forma };
  }

  async function negocioConfirmado() {
    const base = await negocioComForma();
    const { error } = await confirmar(parceiro, base.negocio, "acertado por WhatsApp");
    if (error) throw new Error(`Forma não confirmada: ${error.message}`);
    return base;
  }

  beforeAll(async () => {
    [parceiro, staff, duli, cliente] = await Promise.all([
      entrarComo("parceiro"),
      entrarComo("staff"),
      entrarComo("colaborador"),
      entrarComo("cliente"),
    ]);
    parceiroId = (await parceiro.auth.getUser()).data.user!.id;
    staffId = (await staff.auth.getUser()).data.user!.id;
    const fx = await fixture(parceiro);
    org = fx.organization_id;
    fixturePessoa = fx.id;

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
    perdaId = etapas.find((e) => e.is_lost)!.id;

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
    if (vistosCriados.length) await parceiro.from("visa_types").delete().in("id", vistosCriados);
  });

  it("membro salva a forma; salvar de novo mantém os ids das partes (foco 4)", async () => {
    const pessoa = await novaPessoa();
    const negocio = await novoNegocio(pessoa, parceiroId);
    await comVistos(negocio);

    const primeira = await salvar(staff, negocio, CRITERIO());
    expect(primeira.error).toBeNull();
    const forma = (await formaDo(negocio))!;
    expect(primeira.data).toBe(forma.id);
    expect(forma.status).toBe("rascunho");

    const partes = await partesDa(forma.id);
    expect(partes.map((p) => p.label)).toEqual(["Entrada", "Parcelas"]);
    expect(await parcelasDas(partes.map((p) => p.id))).toHaveLength(4);

    expect((await salvar(staff, negocio, CRITERIO())).error).toBeNull();
    expect((await partesDa(forma.id)).map((p) => p.id)).toEqual(partes.map((p) => p.id));
    expect(await parcelasDas(partes.map((p) => p.id))).toHaveLength(4);

    expect((await salvar(staff, negocio, { partes: [PARCELAS()] })).error).toBeNull();
    const depois = await partesDa(forma.id);
    expect(depois).toHaveLength(1);
    expect(depois[0]!.label).toBe("Parcelas");
    expect(await parcelasDas(depois.map((p) => p.id))).toHaveLength(3);
  });

  it("salvar recusa o que a tela recusa, sempre com frase (foco 1)", async () => {
    const pessoa = await novaPessoa();
    const negocio = await novoNegocio(pessoa, parceiroId);

    const comParcela = (alterar: (p: Parte) => void) => {
      const p = PARCELAS();
      alterar(p);
      return { partes: [p] };
    };

    const casos: [unknown, string][] = [
      [comParcela((p) => (p.parcelas[2]!.amount = 2999.99)), MSG.soma],
      [
        comParcela((p) => {
          p.total = 10000;
          p.parcelas = [3333.335, 3333.335, 3333.33].map((amount, i) => ({ ...p.parcelas[i]!, amount }));
        }),
        MSG.casas,
      ],
      [comParcela((p) => (p.parcelas = p.parcelas.slice(0, 2))), MSG.lista],
      [comParcela((p) => (p.installments_count = 37)), MSG.limiteParcelas],
      [comParcela((p) => ((p.method = "cartao"), (p.installments_count = 2))), MSG.cartao],
      [{ partes: Array.from({ length: 11 }, () => PARCELAS()) }, MSG.onzePartes],
      [comParcela((p) => (p.label = "x".repeat(81))), MSG.rotulo],
      [comParcela((p) => (p.parcelas[0]!.due_on = "2026-02-31")), MSG.data],
      [comParcela((p) => (p.parcelas[0]!.due_on = "today")), MSG.data],
      [comParcela((p) => (p.total = 10_000_000_000)), MSG.limiteValor],
      [{ partes: [{ ...PARCELAS(), total: "abc" }] }, MSG.formato],
      [{ partes: "nada" }, MSG.formato],
    ];

    for (const [forma, frase] of casos) {
      const { error } = await salvar(parceiro, negocio, forma);
      expect(error?.message, frase).toBe(frase);
      expect(error?.code).toBe("P0001");
    }
  });

  describe("confirmar pela equipe", () => {
    it("staff que não é dono é recusado; a gestão confirma com a cópia e o histórico", async () => {
      const { pessoa, negocio, forma } = await negocioComForma();

      expect((await confirmar(staff, negocio)).error?.message).toBe(MSG.semPoder);
      expect((await confirmar(parceiro, negocio, "x".repeat(501))).error?.message).toBe(MSG.observacao);

      expect((await confirmar(parceiro, negocio, " acertado por WhatsApp ")).error).toBeNull();
      expect((await formaDo(negocio))!.status).toBe("confirmada");

      const [resposta, ...outras] = await respostasDa(forma.id);
      expect(outras).toHaveLength(0);
      expect(resposta).toMatchObject({
        decision: "confirmada_pela_equipe",
        reason: "acertado por WhatsApp",
        answered_by: parceiroId,
        registration_form_id: null,
      });
      expect(resposta!.answered_by_name).toBeTruthy();

      const copia = resposta!.snapshot as { vistos: unknown[]; partes: unknown[] };
      expect(copia.vistos).toHaveLength(2);
      expect(copia.partes).toHaveLength(2);
      expect(JSON.stringify(copia)).not.toContain("reference_rate");

      expect(await historico(pessoa)).toContainEqual({
        type: "forma_de_pagamento",
        description: "Forma de pagamento confirmada pela equipe",
      });
    });

    it("sem forma, sem parte ou sem visto, recusa com a frase", async () => {
      const pessoa = await novaPessoa();
      const semForma = await novoNegocio(pessoa, parceiroId);
      await comVistos(semForma);
      expect((await confirmar(parceiro, semForma)).error?.message).toBe(MSG.semParteOuVisto);

      expect((await salvar(parceiro, semForma, { partes: [] })).error).toBeNull();
      expect((await confirmar(parceiro, semForma)).error?.message).toBe(MSG.semParteOuVisto);

      const semVisto = await novoNegocio(pessoa, parceiroId);
      expect((await salvar(parceiro, semVisto, CRITERIO())).error).toBeNull();
      expect((await confirmar(parceiro, semVisto)).error?.message).toBe(MSG.semParteOuVisto);
    });

    it("o staff dono do negócio confirma e refaz (CRM-10)", async () => {
      const pessoa = await novaPessoa();
      const negocio = await novoNegocio(pessoa, staffId, staff);
      await comVistos(negocio);
      expect((await salvar(staff, negocio, CRITERIO())).error).toBeNull();

      expect((await confirmar(staff, negocio)).error).toBeNull();
      const forma = (await formaDo(negocio))!;
      expect((await respostasDa(forma.id))[0]!.answered_by).toBe(staffId);

      expect((await refazer(staff, negocio)).error).toBeNull();
      expect((await formaDo(negocio))!.status).toBe("rascunho");
    });

    it("clique duplo: uma confirmação passa e fica uma resposta só (foco 4)", async () => {
      const { negocio, forma } = await negocioComForma();

      const [a, b] = await Promise.all([confirmar(parceiro, negocio), confirmar(parceiro, negocio)]);
      const erros = [a.error, b.error].filter(Boolean);
      expect(erros).toHaveLength(1);
      expect(erros[0]!.message).toBe(MSG.confirmada);
      expect(await respostasDa(forma.id)).toHaveLength(1);

      expect((await salvar(parceiro, negocio, CRITERIO())).error?.message).toBe(MSG.confirmada);
    });
  });

  it("Refazer: staff recusado; a gestão volta a rascunho e a resposta fica", async () => {
    const { pessoa, negocio, forma } = await negocioConfirmado();

    expect((await refazer(staff, negocio)).error?.message).toBe(MSG.semPoder);
    expect((await refazer(parceiro, negocio)).error).toBeNull();
    expect((await formaDo(negocio))!.status).toBe("rascunho");
    expect(await respostasDa(forma.id)).toHaveLength(1);
    expect(await historico(pessoa)).toContainEqual({
      type: "forma_de_pagamento",
      description: "Forma de pagamento refeita",
    });

    expect((await refazer(parceiro, negocio)).error?.message).toBe(MSG.mudou);

    expect((await confirmar(parceiro, negocio)).error).toBeNull();
    expect(await respostasDa(forma.id)).toHaveLength(2);
  });

  describe("a prova não se forja pela API", () => {
    it("resposta, estado e charges_created_at só pelas funções", async () => {
      const { negocio, forma } = await negocioConfirmado();

      for (const decision of ["confirmada", "recusada", "confirmada_pela_equipe"]) {
        const { error } = await parceiro.from("payment_plan_responses").insert({
          organization_id: org,
          plan_id: forma.id,
          decision,
          snapshot: {},
          answered_by: parceiroId,
        });
        expect(error, decision).not.toBeNull();
      }

      expect(
        (await parceiro.from("payment_plans").update({ status: "rascunho" }).eq("id", forma.id)).error,
      ).not.toBeNull();
      expect(
        (await parceiro.from("payment_plans").update({ charges_created_at: new Date().toISOString() }).eq("id", forma.id))
          .error,
      ).not.toBeNull();
      // A 0060 libera anular `created_by` só dentro de gatilho (o usuário
      // excluído); pela API, continua recusado.
      expect(
        (await parceiro.from("payment_plans").update({ created_by: null }).eq("id", forma.id)).error?.message,
      ).toBe("Mude a forma de pagamento pela tela do negócio.");

      // O critério, ao pé da letra: o rascunho não vira confirmada sem a função.
      const rascunho = await novoNegocio(await novaPessoa(), parceiroId);
      expect((await salvar(parceiro, rascunho, CRITERIO())).error).toBeNull();
      expect(
        (await parceiro.from("payment_plans").update({ status: "confirmada" }).eq("opportunity_id", rascunho))
          .error?.message,
      ).toBe("Mude a forma de pagamento pela tela do negócio.");
      expect((await formaDo(rascunho))?.status).toBe("rascunho");

      const outro = await novoNegocio(await novaPessoa(), parceiroId);
      expect(
        (await parceiro.from("payment_plans").insert({ organization_id: org, opportunity_id: outro, status: "confirmada" }))
          .error,
      ).not.toBeNull();

      const apagou = await parceiro.from("payment_plans").delete().eq("id", forma.id).select("id");
      expect(apagou.data ?? []).toHaveLength(0);
      expect(await formaDo(negocio)).not.toBeNull();
      expect(await respostasDa(forma.id)).toHaveLength(1);
    });

    it("partes e parcelas não se mexem direto; respostas não mudam", async () => {
      const { forma } = await negocioConfirmado();
      const partes = await partesDa(forma.id);
      const parcelas = await parcelasDas(partes.map((p) => p.id));

      expect(
        (
          await parceiro.from("payment_plan_parts").insert({
            organization_id: org,
            plan_id: forma.id,
            position: 5,
            label: "Extra",
            method: "pix",
            currency: "BRL",
            total: 1,
            installments_count: 1,
          })
        ).error,
      ).not.toBeNull();
      expect(
        (await parceiro.from("payment_plan_parts").update({ total: 1 }).eq("id", partes[0]!.id)).error,
      ).not.toBeNull();
      expect((await parceiro.from("payment_plan_parts").delete().eq("id", partes[0]!.id)).error).not.toBeNull();

      expect(
        (
          await parceiro
            .from("payment_plan_installments")
            .insert({ organization_id: org, part_id: partes[0]!.id, number: 9, amount: 1, due_on: hojeMais(1) })
        ).error,
      ).not.toBeNull();
      expect(
        (await parceiro.from("payment_plan_installments").update({ amount: 1 }).eq("id", parcelas[0]!.id)).error,
      ).not.toBeNull();
      expect(
        (await parceiro.from("payment_plan_installments").delete().eq("id", parcelas[0]!.id)).error,
      ).not.toBeNull();
      expect(await parcelasDas(partes.map((p) => p.id))).toHaveLength(4);

      const [antes] = await respostasDa(forma.id);
      const mudou = await parceiro
        .from("payment_plan_responses")
        .update({ reason: "forjado" })
        .eq("id", antes!.id)
        .select("id");
      expect(mudou.data ?? []).toHaveLength(0);
      const apagou = await parceiro.from("payment_plan_responses").delete().eq("id", antes!.id).select("id");
      expect(apagou.data ?? []).toHaveLength(0);
      expect((await respostasDa(forma.id))[0]).toEqual(antes);
    });

    it("cobrança manual não se passa por cobrança da forma (P13)", async () => {
      const { forma } = await negocioConfirmado();
      const [parte] = await partesDa(forma.id);

      const pessoa = await novaPessoa();
      const manual = await parceiro
        .from("receivables")
        .insert({ organization_id: org, person_id: pessoa, title: `Manual ${s}`, amount: 100, currency: "BRL" })
        .select("id")
        .single();
      expect(manual.error).toBeNull();

      const marcou = await parceiro
        .from("receivables")
        .update({ payment_plan_part_id: parte!.id })
        .eq("id", manual.data!.id);
      expect(marcou.error?.message).toBe(MSG.parteSoNoGanho);

      const nasceu = await parceiro.from("receivables").insert({
        organization_id: org,
        person_id: pessoa,
        title: `Forjada ${s}`,
        amount: 100,
        currency: "BRL",
        payment_plan_part_id: parte!.id,
      });
      expect(nasceu.error?.message).toBe(MSG.parteSoNoGanho);
    });
  });

  it("a cotação muda direto, em qualquer estado, e a cópia não muda (FIC-11)", async () => {
    const { forma } = await negocioConfirmado();
    const [antes] = await respostasDa(forma.id);

    const mudou = await parceiro
      .from("payment_plans")
      .update({ reference_rate: 5.425, reference_rate_note: "C6, hoje" })
      .eq("id", forma.id)
      .select("reference_rate, reference_rate_note")
      .single();
    expect(mudou.error).toBeNull();
    expect(mudou.data).toEqual({ reference_rate: 5.425, reference_rate_note: "C6, hoje" });
    expect((await respostasDa(forma.id))[0]!.snapshot).toEqual(antes!.snapshot);

    expect((await parceiro.from("payment_plans").update({ reference_rate: 0 }).eq("id", forma.id)).error).not.toBeNull();
    // NaN passava no `> 0` (o Postgres o ordena acima de todo número) e a tela
    // do lead caía ao ler de volta o texto "NaN" (0062).
    expect(
      (await parceiro.from("payment_plans").update({ reference_rate: "NaN" as never }).eq("id", forma.id)).error?.code,
    ).toBe("23514");
    expect(
      (await parceiro.from("payment_plans").update({ reference_rate_note: "x".repeat(201) }).eq("id", forma.id)).error,
    ).not.toBeNull();
    expect(
      (await parceiro.from("payment_plans").update({ reference_rate: null }).eq("id", forma.id)).error,
    ).toBeNull();
  });

  it("com a forma confirmada, os vistos travam; depois de Refazer, voltam (FIC-12)", async () => {
    const pessoa = await novaPessoa();
    const negocio = await novoNegocio(pessoa, parceiroId);

    const { data: descartavel, error: erroVisto } = await parceiro
      .from("visa_types")
      .insert({ organization_id: org, name: `Visto descartável ${s}` })
      .select("id")
      .single();
    if (erroVisto) throw new Error(`Visto descartável não criado: ${erroVisto.message}`);
    vistosCriados.push(descartavel.id);

    const [eb1a] = await comVistos(negocio);
    const comDescartavel = await novoItem(negocio, "EB-2", { position: 2, visa_type_id: descartavel.id });
    expect(comDescartavel.error).toBeNull();
    expect((await salvar(parceiro, negocio, CRITERIO())).error).toBeNull();
    expect((await confirmar(parceiro, negocio)).error).toBeNull();

    expect((await novoItem(negocio, "L-1", { position: 3 })).error?.message).toBe(MSG.vistos);
    expect(
      (await parceiro.from("opportunity_items").update({ amount: 1 }).eq("id", eb1a!)).error?.message,
    ).toBe(MSG.vistos);
    expect((await parceiro.from("opportunity_items").delete().eq("id", eb1a!)).error?.message).toBe(MSG.vistos);

    // Apagar o tipo de visto nas Configurações continua anulando o item (ação da chave).
    expect((await parceiro.from("visa_types").delete().eq("id", descartavel.id)).error).toBeNull();
    const { data: item } = await parceiro
      .from("opportunity_items")
      .select("visa_type_id")
      .eq("id", comDescartavel.data!.id)
      .single();
    expect(item!.visa_type_id).toBeNull();

    expect((await refazer(parceiro, negocio)).error).toBeNull();
    expect((await novoItem(negocio, "L-1", { position: 3 })).error).toBeNull();
    expect((await parceiro.from("opportunity_items").update({ amount: 1 }).eq("id", eb1a!)).error).toBeNull();
  });

  it("negócio encerrado: salvar, confirmar e refazer recusados; a cotação muda", async () => {
    const { negocio, forma } = await negocioConfirmado();
    const perdido = await parceiro
      .from("opportunities")
      .update({ status: "lost", stage_id: perdaId, closed_at: new Date().toISOString() })
      .eq("id", negocio);
    expect(perdido.error).toBeNull();

    expect((await salvar(parceiro, negocio, CRITERIO())).error?.message).toBe(MSG.encerrado);
    expect((await confirmar(parceiro, negocio)).error?.message).toBe(MSG.encerrado);
    expect((await refazer(parceiro, negocio)).error?.message).toBe(MSG.encerrado);
    expect(
      (await parceiro.from("payment_plans").update({ reference_rate: 5.1 }).eq("id", forma.id)).error,
    ).toBeNull();
  });

  it("excluir: com confirmação registrada não se exclui; só em rascunho, sim", async () => {
    const { negocio } = await negocioConfirmado();
    expect((await refazer(parceiro, negocio)).error).toBeNull();

    const recusado = await parceiro.from("opportunities").delete().eq("id", negocio);
    expect(recusado.error?.message).toBe(MSG.excluir);
    expect(await formaDo(negocio)).not.toBeNull();

    const soRascunho = await negocioComForma();
    const apagou = await parceiro.from("opportunities").delete().eq("id", soRascunho.negocio).select("id");
    expect(apagou.error).toBeNull();
    expect(apagou.data).toHaveLength(1);
    expect(await formaDo(soRascunho.negocio)).toBeNull();
  });

  it("o cliente do portal não lê a forma do próprio negócio (P7)", async () => {
    const negocio = await novoNegocio(fixturePessoa, parceiroId);
    try {
      expect((await salvar(parceiro, negocio, CRITERIO())).error).toBeNull();
      const forma = (await formaDo(negocio))!;
      const partes = await partesDa(forma.id);

      expect(await formaDo(negocio, cliente)).toBeNull();
      expect(await partesDa(forma.id, cliente)).toHaveLength(0);
      expect(await parcelasDas(partes.map((p) => p.id), cliente)).toHaveLength(0);
      expect(await respostasDa(forma.id, cliente)).toHaveLength(0);
    } finally {
      const { data, error } = await parceiro.from("opportunities").delete().eq("id", negocio).select("id");
      if (error || data?.length !== 1) {
        throw new Error(`O negócio de teste no Cliente de Teste não foi apagado: ${error?.message ?? data?.length}`);
      }
    }
  });

  it("apagar a pessoa leva a forma confirmada e a resposta", async () => {
    const { pessoa, negocio } = await negocioConfirmado();
    const { error } = await parceiro.from("people").delete().eq("id", pessoa);
    expect(error).toBeNull();
    expect(await formaDo(negocio)).toBeNull();
  });

  it("colaborador da Duli não alcança a forma da parceira", async () => {
    const { negocio, forma } = await negocioConfirmado();
    const partes = await partesDa(forma.id);

    expect(await formaDo(negocio, duli)).toBeNull();
    expect(await partesDa(forma.id, duli)).toHaveLength(0);
    expect(await parcelasDas(partes.map((p) => p.id), duli)).toHaveLength(0);
    expect(await respostasDa(forma.id, duli)).toHaveLength(0);

    const cotacao = await duli.from("payment_plans").update({ reference_rate: 9 }).eq("id", forma.id).select("id");
    expect(cotacao.data ?? []).toHaveLength(0);

    expect((await salvar(duli, negocio, CRITERIO())).error?.message).toBe(MSG.naoEncontrado);
    expect((await confirmar(duli, negocio)).error?.message).toBe(MSG.naoEncontrado);
    expect((await refazer(duli, negocio)).error?.message).toBe(MSG.naoEncontrado);
  });
});
