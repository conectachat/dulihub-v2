// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { entrarComo, fixture, pessoaDescartavel, type Cliente } from "./clientes";

/**
 * Vistos do negócio e processo que não se apaga (0051; CRM-13, PRO-12).
 *
 * - O item guarda nome, valor e moeda do momento da negociação: mudar o
 *   preço nas Configurações não o toca.
 * - Negócio ganho trava os itens; só a cascata da pessoa passa.
 * - A ligação processo → item é amarrada ao negócio do processo e não muda
 *   depois de gravada (D18): é ela que impede o processo repetido.
 * - Processo não se apaga pela API; apagar a pessoa (só na organização de
 *   teste) o leva junto.
 *
 * Tudo em pessoas descartáveis da organização de teste, apagadas no fim.
 */

const TRAVA_DO_GANHO =
  "Negócio ganho: os vistos não mudam. Para desistir de um visto, encerre o processo dele.";
const ITEM_IMUTAVEL = "O processo não muda de visto do negócio.";
const ITEM_NAO_MUDA_DE_NEGOCIO = "O visto não muda de negócio.";
const ITEM_SEM_NEGOCIO = "Processo ligado a visto do negócio precisa estar ligado ao negócio.";
const TEM_PROCESSO = "Este visto já tem processo: para desistir, encerre o processo.";

describe("vistos do negócio e processo que não se apaga (0051)", () => {
  let parceiro: Cliente;
  let duli: Cliente;
  let org: string;
  let funilId: string;
  let abertaId: string;
  let vistoId: string;
  const criadas: string[] = [];

  async function pessoa(): Promise<string> {
    const id = await pessoaDescartavel(parceiro, org, "Vistos");
    criadas.push(id);
    return id;
  }

  async function negocio(pessoaId: string): Promise<string> {
    const { data, error } = await parceiro
      .from("opportunities")
      .insert({
        organization_id: org,
        person_id: pessoaId,
        pipeline_id: funilId,
        stage_id: abertaId,
        title: "Negócio dos vistos",
      })
      .select("id")
      .single();
    if (error) throw new Error(`Negócio não criado: ${error.message}`);
    return data.id;
  }

  async function item(negocioId: string, extra: Record<string, unknown> = {}) {
    return parceiro
      .from("opportunity_items")
      .insert({
        organization_id: org,
        opportunity_id: negocioId,
        visa_type_id: vistoId,
        visa_name: "EB-1A",
        amount: 8000,
        currency: "USD",
        ...extra,
      })
      .select("id, amount, currency, visa_name")
      .single();
  }

  async function processo(
    pessoaId: string,
    extra: { p_opportunity?: string; p_item?: string } = {},
  ) {
    return parceiro.rpc("criar_processo", {
      p_person: pessoaId,
      p_visa_type: vistoId,
      p_title: "Processo dos vistos",
      ...extra,
    });
  }

  /** Ganho e reabertura só pelas funções (0054). */
  async function ganhar(negocioId: string) {
    const { error } = await parceiro.rpc("ganhar_negocio", { p_negocio: negocioId });
    if (error) throw new Error(`Ganho falhou: ${error.message}`);
  }

  async function reabrir(negocioId: string) {
    const { error } = await parceiro.rpc("reabrir_negocio", { p_negocio: negocioId });
    if (error) throw new Error(`Reabrir falhou: ${error.message}`);
  }

  beforeAll(async () => {
    [parceiro, duli] = await Promise.all([entrarComo("parceiro"), entrarComo("colaborador")]);
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
    abertaId = etapas
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

  // Primeiro de propósito: toda a limpeza nova depende disto.
  it("a cascata de people atravessa a RLS de projects", async () => {
    const p = await pessoa();
    const { data: processoId, error } = await processo(p);
    expect(error).toBeNull();

    const apagada = await parceiro.from("people").delete().eq("id", p).select("id");
    expect(apagada.error).toBeNull();
    expect(apagada.data).toHaveLength(1);

    const sobrou = await parceiro.from("projects").select("id").eq("id", processoId!);
    expect(sobrou.data).toEqual([]);
  });

  it("delete em projects pela API apaga 0 linhas", async () => {
    const p = await pessoa();
    const { data: processoId } = await processo(p);

    const { data, error } = await parceiro
      .from("projects")
      .delete()
      .eq("id", processoId!)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const continua = await parceiro.from("projects").select("id").eq("id", processoId!);
    expect(continua.data).toHaveLength(1);
  });

  describe("item", () => {
    it("o parceiro grava e lê; a Duli não lê", async () => {
      const n = await negocio(await pessoa());
      const { data, error } = await item(n);
      expect(error).toBeNull();
      expect(data).toMatchObject({ amount: 8000, currency: "USD", visa_name: "EB-1A" });

      const daDuli = await duli.from("opportunity_items").select("id").eq("id", data!.id);
      expect(daDuli.data ?? []).toEqual([]);
    });

    it("moeda fora de BRL e USD é recusada", async () => {
      const n = await negocio(await pessoa());
      const { error } = await item(n, { currency: "EUR" });
      expect(error?.code).toBe("23514");
    });

    it("valor negativo é recusado", async () => {
      const n = await negocio(await pessoa());
      const { error } = await item(n, { amount: -1 });
      expect(error?.code).toBe("23514");
    });

    it("valor NaN é recusado, no item e no preço do visto (0063)", async () => {
      // NaN passava no `>= 0` (o Postgres o ordena acima de todo número), e o
      // preço do visto não tinha `check` nenhum.
      const n = await negocio(await pessoa());
      expect((await item(n, { amount: "NaN" })).error?.code).toBe("23514");

      const { data: antes } = await parceiro
        .from("visa_types")
        .select("base_price")
        .eq("id", vistoId)
        .single();
      try {
        const { error } = await parceiro
          .from("visa_types")
          .update({ base_price: "NaN" as never })
          .eq("id", vistoId);
        expect(error?.code).toBe("23514");
      } finally {
        await parceiro.from("visa_types").update({ base_price: antes!.base_price }).eq("id", vistoId);
      }
    });
  });

  it("mudar o preço do visto não muda o item", async () => {
    const n = await negocio(await pessoa());
    const { data: criado } = await item(n);

    const { data: antes } = await parceiro
      .from("visa_types")
      .select("base_price")
      .eq("id", vistoId)
      .single();
    try {
      const { error } = await parceiro
        .from("visa_types")
        .update({ base_price: 12345 })
        .eq("id", vistoId);
      expect(error).toBeNull();

      const { data: depois } = await parceiro
        .from("opportunity_items")
        .select("amount")
        .eq("id", criado!.id)
        .single();
      expect(depois!.amount).toBe(8000);
    } finally {
      await parceiro.from("visa_types").update({ base_price: antes!.base_price }).eq("id", vistoId);
    }
  });

  it("item de negócio ganho não muda, e a cascata da pessoa passa", async () => {
    const p = await pessoa();
    const n = await negocio(p);
    const { data: existente } = await item(n);
    await ganhar(n);

    const novo = await item(n, { visa_name: "O-1" });
    expect(novo.error?.message).toBe(TRAVA_DO_GANHO);

    const editado = await parceiro
      .from("opportunity_items")
      .update({ amount: 1 })
      .eq("id", existente!.id);
    expect(editado.error?.message).toBe(TRAVA_DO_GANHO);

    const removido = await parceiro.from("opportunity_items").delete().eq("id", existente!.id);
    expect(removido.error?.message).toBe(TRAVA_DO_GANHO);

    await parceiro.from("people").delete().eq("id", p);
    const sobrou = await parceiro.from("opportunity_items").select("id").eq("id", existente!.id);
    expect(sobrou.data).toEqual([]);
  });

  // Remover e acrescentar de novo criaria um segundo processo no próximo
  // Ganho, e processo não se apaga. O app recusa desde a fase 1; a 0054
  // recusa no banco.
  it("item que já tem processo não se remove, nem com o negócio reaberto; a cascata passa", async () => {
    const p = await pessoa();
    const n = await negocio(p);
    const { data: comProcesso } = await item(n);
    await ganhar(n);
    await reabrir(n);

    const removido = await parceiro.from("opportunity_items").delete().eq("id", comProcesso!.id);
    expect(removido.error?.message).toBe(TEM_PROCESSO);

    const { data: semProcesso } = await item(n, { visa_name: "O-1" });
    const outro = await parceiro
      .from("opportunity_items")
      .delete()
      .eq("id", semProcesso!.id)
      .select("id");
    expect(outro.error).toBeNull();
    expect(outro.data).toHaveLength(1);

    await parceiro.from("people").delete().eq("id", p);
    const sobrou = await parceiro.from("opportunity_items").select("id").eq("id", comProcesso!.id);
    expect(sobrou.data).toEqual([]);
  });

  describe("processo ligado ao item", () => {
    it("criar_processo com p_item grava a ligação, e um segundo é recusado", async () => {
      const p = await pessoa();
      const n = await negocio(p);
      const { data: i } = await item(n);

      const primeiro = await processo(p, { p_opportunity: n, p_item: i!.id });
      expect(primeiro.error).toBeNull();
      const { data: ligado } = await parceiro
        .from("projects")
        .select("opportunity_item_id")
        .eq("id", primeiro.data!)
        .single();
      expect(ligado!.opportunity_item_id).toBe(i!.id);

      const segundo = await processo(p, { p_opportunity: n, p_item: i!.id });
      expect(segundo.error?.code).toBe("23505");
    });

    it("item de outro negócio é recusado", async () => {
      const p = await pessoa();
      const n = await negocio(p);
      const outro = await negocio(p);
      const { data: doOutro } = await item(outro);

      const { error } = await processo(p, { p_opportunity: n, p_item: doOutro!.id });
      expect(error?.code).toBe("23503");
    });

    it("a ligação não muda depois de gravada", async () => {
      const p = await pessoa();
      const n = await negocio(p);
      const { data: i } = await item(n);
      const { data: processoId } = await processo(p, { p_opportunity: n, p_item: i!.id });

      const { error } = await parceiro
        .from("projects")
        .update({ opportunity_item_id: null })
        .eq("id", processoId!);
      expect(error?.message).toBe(ITEM_IMUTAVEL);
    });

    it("o item não muda de negócio", async () => {
      const p = await pessoa();
      const n = await negocio(p);
      const outro = await negocio(p);
      const { data: i } = await item(n);

      const { error } = await parceiro
        .from("opportunity_items")
        .update({ opportunity_id: outro })
        .eq("id", i!.id);
      expect(error?.message).toBe(ITEM_NAO_MUDA_DE_NEGOCIO);
    });

    it("processo com item e sem negócio é recusado, pela função e direto", async () => {
      const p = await pessoa();
      const n = await negocio(p);
      const { data: i } = await item(n);

      const pelaFuncao = await processo(p, { p_item: i!.id });
      expect(pelaFuncao.error?.message).toBe(ITEM_SEM_NEGOCIO);

      const direto = await parceiro.from("projects").insert({
        organization_id: org,
        person_id: p,
        title: "Processo solto",
        opportunity_item_id: i!.id,
      });
      expect(direto.error?.message).toBe(ITEM_SEM_NEGOCIO);
    });

    it("processo ligado não perde o negócio por update", async () => {
      const p = await pessoa();
      const n = await negocio(p);
      const { data: i } = await item(n);
      const { data: processoId } = await processo(p, { p_opportunity: n, p_item: i!.id });

      const { error } = await parceiro
        .from("projects")
        .update({ opportunity_id: null })
        .eq("id", processoId!);
      expect(error?.message).toBe(ITEM_SEM_NEGOCIO);
    });

    it("apagar negócio aberto com processo ligado deixa o processo sem negócio e sem item", async () => {
      const p = await pessoa();
      const n = await negocio(p);
      const { data: i } = await item(n);
      const { data: processoId } = await processo(p, { p_opportunity: n, p_item: i!.id });

      const apagado = await parceiro.from("opportunities").delete().eq("id", n).select("id");
      expect(apagado.error).toBeNull();
      expect(apagado.data).toHaveLength(1);

      const { data: restou } = await parceiro
        .from("projects")
        .select("opportunity_id, opportunity_item_id")
        .eq("id", processoId!)
        .single();
      expect(restou).toEqual({ opportunity_id: null, opportunity_item_id: null });
    });
  });
});
