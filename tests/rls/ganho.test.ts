// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resumoDoGanhoSchema } from "@/features/opportunities/schema";

import { entrarComo, fixture, type Cliente } from "./clientes";

/**
 * Ganho e reabertura pelo banco (0052; CRM-10, CRM-14, CRM-15).
 *
 * `ganhar_negocio` faz tudo numa transação: negócio ganho, histórico,
 * cliente (dono e participantes), um processo por visto. Com `p_simular`,
 * devolve o mesmo formato sem gravar — é o resumo da tela, e por isso o
 * resumo e a gravação nunca divergem. `reabrir_negocio` volta à primeira
 * etapa aberta sem tocar em pessoa nem processo. Os dois conferem o CRM-10:
 * só o dono do negócio ou a gestão.
 *
 * Tudo em pessoas descartáveis da organização de teste, apagadas no fim (a
 * cascata leva negócio, itens, processos e histórico). O que se muda na
 * configuração da organização de teste é restaurado em `finally`.
 */

const s = crypto.randomUUID().replace(/-/g, "").slice(0, 8);

const MSG = {
  naoEncontrado: "Negócio não encontrado.",
  jaGanho: "Este negócio já foi ganho.",
  naoGanho: "Este negócio não está ganho.",
  ganharSemPoder: "Só o dono do negócio ou a gestão ganham o negócio.",
  reabrirSemPoder: "Só o dono do negócio ou a gestão reabrem o negócio.",
  semItem: "Acrescente pelo menos um visto antes do Ganho.",
  lixeira: "Este contato está na lixeira. Restaure antes.",
  semVisto: (nome: string) =>
    `O item ${nome} está sem visto. Remova o item e acrescente um visto do catálogo.`,
};

/** Hoje no fuso de São Paulo, como o banco calcula. */
function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** O jsonb de `ganhar_negocio`, lido pelo mesmo esquema que a tela usa. */
const lerResumo = (data: unknown) => resumoDoGanhoSchema.parse(data);

describe("ganhar e reabrir negócio (0052)", () => {
  let parceiro: Cliente;
  let staff: Cliente;
  let duli: Cliente;
  let parceiroId: string;
  let staffId: string;
  let org: string;
  let funilId: string;
  let primeiraAberta: string;
  let ganhoId: string;
  let vistoId: string;
  const criadas: string[] = [];
  const vistosCriados: string[] = [];
  let contador = 0;

  async function novaPessoa(extra: Record<string, unknown> = {}): Promise<{ id: string; nome: string }> {
    contador += 1;
    const nome = `Ganho ${s} ${contador}`;
    const { data, error } = await parceiro
      .from("people")
      .insert({ organization_id: org, full_name: nome, lifecycle_stage: "opportunity", ...extra })
      .select("id")
      .single();
    if (error) throw new Error(`Pessoa descartável não criada: ${error.message}`);
    criadas.push(data.id);
    return { id: data.id, nome };
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

  async function novoItem(
    negocioId: string,
    visaName: string,
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const { data, error } = await parceiro
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
    if (error) throw new Error(`Item não criado: ${error.message}`);
    return data.id;
  }

  async function novoVisto(): Promise<string> {
    const { data, error } = await parceiro
      .from("visa_types")
      .insert({ organization_id: org, name: `Visto descartável ${s} ${vistosCriados.length}` })
      .select("id")
      .single();
    if (error) throw new Error(`Visto descartável não criado: ${error.message}`);
    vistosCriados.push(data.id);
    return data.id;
  }

  const ganhar = (quem: Cliente, negocioId: string, simular = false) =>
    quem.rpc("ganhar_negocio", { p_negocio: negocioId, p_simular: simular });

  const reabrir = (quem: Cliente, negocioId: string) =>
    quem.rpc("reabrir_negocio", { p_negocio: negocioId });

  async function negocio(id: string) {
    const { data, error } = await parceiro
      .from("opportunities")
      .select("status, stage_id, closed_at")
      .eq("id", id)
      .single();
    if (error) throw new Error(`Negócio ilegível: ${error.message}`);
    return data;
  }

  async function pessoa(id: string) {
    const { data, error } = await parceiro
      .from("people")
      .select("lifecycle_stage, client_since, owner_id")
      .eq("id", id)
      .single();
    if (error) throw new Error(`Pessoa ilegível: ${error.message}`);
    return data;
  }

  async function processosDo(negocioId: string) {
    const { data, error } = await parceiro
      .from("projects")
      .select("id, title, opportunity_item_id, visa_type_id")
      .eq("opportunity_id", negocioId)
      .order("created_at");
    if (error) throw new Error(`Processos ilegíveis: ${error.message}`);
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

  beforeAll(async () => {
    [parceiro, staff, duli] = await Promise.all([
      entrarComo("parceiro"),
      entrarComo("staff"),
      entrarComo("colaborador"),
    ]);
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
    ganhoId = etapas.find((e) => e.is_won)!.id;

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

  it("Ganho com EB-1A e O-1 cria 2 processos com o molde", async () => {
    const p = await novaPessoa();
    const n = await novoNegocio(p.id, parceiroId);
    await novoItem(n, "EB-1A", { position: 0 });
    await novoItem(n, "O-1", { position: 1, amount: 6000 });

    const { data, error } = await ganhar(parceiro, n);
    expect(error).toBeNull();
    const resumo = lerResumo(data);
    expect(resumo.processos.map((x) => x.titulo)).toEqual([
      `EB-1A — ${p.nome}`,
      `O-1 — ${p.nome}`,
    ]);
    expect(resumo.processos.every((x) => x.id)).toBe(true);
    expect(resumo.cobrancas).toEqual([]);

    const ganho = await negocio(n);
    expect(ganho.status).toBe("won");
    expect(ganho.stage_id).toBe(ganhoId);
    expect(ganho.closed_at).not.toBeNull();

    const depois = await pessoa(p.id);
    expect(depois.lifecycle_stage).toBe("client");
    expect(depois.client_since).toBe(hojeEmSaoPaulo());

    const processos = await processosDo(n);
    expect(processos).toHaveLength(2);
    for (const processo of processos) {
      expect(processo.opportunity_item_id).not.toBeNull();
      const etapas = await parceiro.from("project_stages").select("id").eq("project_id", processo.id);
      const pastas = await parceiro.from("project_documents").select("id").eq("project_id", processo.id);
      expect(etapas.data!.length).toBeGreaterThan(0);
      expect(pastas.data!.length).toBeGreaterThan(0);
    }

    expect(await historico(p.id)).toContainEqual({
      type: "virou_cliente",
      description: "Oportunidade ganha — virou cliente",
    });
  });

  it("o resumo e a gravação listam os mesmos processos", async () => {
    const p = await novaPessoa();
    const n = await novoNegocio(p.id, parceiroId);
    await novoItem(n, "EB-1A", { position: 0 });
    await novoItem(n, "O-1", { position: 1 });

    const simulado = await ganhar(parceiro, n, true);
    expect(simulado.error).toBeNull();
    const resumo = lerResumo(simulado.data);
    expect(resumo.pessoa).toMatchObject({ id: p.id, nome: p.nome, vira_cliente: true });
    expect(resumo.itens.map((i) => i.visa_name)).toEqual(["EB-1A", "O-1"]);
    expect(resumo.processos.every((x) => x.id === null)).toBe(true);

    expect((await negocio(n)).status).toBe("open");
    expect((await pessoa(p.id)).lifecycle_stage).toBe("opportunity");
    expect(await processosDo(n)).toEqual([]);

    const real = await ganhar(parceiro, n);
    expect(real.error).toBeNull();
    expect(lerResumo(real.data).processos.map((x) => x.titulo)).toEqual(
      resumo.processos.map((x) => x.titulo),
    );
  });

  describe("recusas, sem mudar nada", () => {
    it("sem item", async () => {
      const p = await novaPessoa();
      const n = await novoNegocio(p.id, parceiroId);
      const { error } = await ganhar(parceiro, n);
      expect(error?.message).toBe(MSG.semItem);
      expect((await negocio(n)).status).toBe("open");
    });

    it("item sem processo e sem visto", async () => {
      const p = await novaPessoa();
      const n = await novoNegocio(p.id, parceiroId);
      await novoItem(n, "Visto antigo", { visa_type_id: null });
      const { error } = await ganhar(parceiro, n);
      expect(error?.message).toBe(MSG.semVisto("Visto antigo"));
      expect((await negocio(n)).status).toBe("open");
      expect(await processosDo(n)).toEqual([]);
    });

    it("pessoa na lixeira", async () => {
      const p = await novaPessoa();
      const n = await novoNegocio(p.id, parceiroId);
      await novoItem(n, "EB-1A");
      await parceiro.from("people").update({ deleted_at: new Date().toISOString() }).eq("id", p.id);
      const { error } = await ganhar(parceiro, n);
      expect(error?.message).toBe(MSG.lixeira);
      expect((await negocio(n)).status).toBe("open");
    });
  });

  it("falha no meio desfaz tudo", async () => {
    const p = await novaPessoa();
    const n = await novoNegocio(p.id, parceiroId);
    await novoItem(n, "EB-1A");
    const antes = await historico(p.id);

    const { data: padrao, error: erroPadrao } = await parceiro
      .from("stage_statuses")
      .select("id")
      .eq("organization_id", org)
      .eq("is_default", true)
      .single();
    if (erroPadrao) throw new Error(`Status padrão ilegível: ${erroPadrao.message}`);

    try {
      const tirou = await parceiro.from("stage_statuses").update({ is_default: false }).eq("id", padrao.id);
      expect(tirou.error).toBeNull();

      // Falha no meio: o negócio e a pessoa já mudaram quando o
      // `criar_processo` recusa; a transação tem de levar tudo de volta.
      const { error } = await ganhar(parceiro, n);
      expect(error?.message).toBe("A organização não tem status de etapa padrão.");
    } finally {
      await parceiro.from("stage_statuses").update({ is_default: true }).eq("id", padrao.id);
    }

    expect((await negocio(n)).status).toBe("open");
    expect((await pessoa(p.id)).lifecycle_stage).toBe("opportunity");
    expect(await processosDo(n)).toEqual([]);
    expect(await historico(p.id)).toEqual(antes);
  });

  describe("duas vezes", () => {
    it("em sequência: a segunda é recusada, e há um processo por item", async () => {
      const p = await novaPessoa();
      const n = await novoNegocio(p.id, parceiroId);
      await novoItem(n, "EB-1A");
      await novoItem(n, "O-1", { position: 1 });

      expect((await ganhar(parceiro, n)).error).toBeNull();
      const segunda = await ganhar(parceiro, n);
      expect(segunda.error?.message).toBe(MSG.jaGanho);
      expect(await processosDo(n)).toHaveLength(2);
    });

    it("ao mesmo tempo: um ganha, o outro é recusado", async () => {
      const p = await novaPessoa();
      const n = await novoNegocio(p.id, parceiroId);
      await novoItem(n, "EB-1A");
      await novoItem(n, "O-1", { position: 1 });

      const [a, b] = await Promise.all([ganhar(parceiro, n), ganhar(parceiro, n)]);
      const erros = [a.error, b.error].filter(Boolean);
      expect(erros).toHaveLength(1);
      expect(erros[0]!.message).toBe(MSG.jaGanho);
      expect(await processosDo(n)).toHaveLength(2);
    });
  });

  it("reabrir não toca em processo, e ganhar de novo cria só o do visto novo", async () => {
    const p = await novaPessoa();
    const n = await novoNegocio(p.id, parceiroId);
    await novoItem(n, "EB-1A");
    await novoItem(n, "O-1", { position: 1 });
    expect((await ganhar(parceiro, n)).error).toBeNull();
    const antes = (await processosDo(n)).map((x) => x.id);

    const reaberto = await reabrir(parceiro, n);
    expect(reaberto.error).toBeNull();
    expect(await negocio(n)).toEqual({ status: "open", stage_id: primeiraAberta, closed_at: null });
    expect((await pessoa(p.id)).lifecycle_stage).toBe("client");
    expect((await processosDo(n)).map((x) => x.id)).toEqual(antes);

    await novoItem(n, "EB-2 NIW", { position: 2 });
    const { data, error } = await ganhar(parceiro, n);
    expect(error).toBeNull();
    expect(lerResumo(data).processos.map((x) => x.titulo)).toEqual([
      `EB-2 NIW — ${p.nome}`,
    ]);
    expect(await processosDo(n)).toHaveLength(3);
  });

  it("reabrir negócio que não está ganho é recusado", async () => {
    const p = await novaPessoa();
    const n = await novoNegocio(p.id, parceiroId);
    const { error } = await reabrir(parceiro, n);
    expect(error?.message).toBe(MSG.naoGanho);
  });

  describe("CRM-10: só o dono do negócio ou a gestão", () => {
    it("o staff não ganha nem reabre negócio de outro dono", async () => {
      const p = await novaPessoa();
      const n = await novoNegocio(p.id, parceiroId);
      await novoItem(n, "EB-1A");

      const ganhou = await ganhar(staff, n);
      expect(ganhou.error?.message).toBe(MSG.ganharSemPoder);
      expect((await negocio(n)).status).toBe("open");

      expect((await ganhar(parceiro, n)).error).toBeNull();
      const reabriu = await reabrir(staff, n);
      expect(reabriu.error?.message).toBe(MSG.reabrirSemPoder);
      expect((await negocio(n)).status).toBe("won");
    });

    it("o staff dono ganha o próprio negócio", async () => {
      const p = await novaPessoa();
      const n = await novoNegocio(p.id, staffId, staff);
      await novoItem(n, "EB-1A");

      const { error } = await ganhar(staff, n);
      expect(error).toBeNull();
      expect((await pessoa(p.id)).lifecycle_stage).toBe("client");
    });
  });

  it("colaborador da Duli não alcança o negócio da parceira", async () => {
    const p = await novaPessoa();
    const n = await novoNegocio(p.id, parceiroId);
    await novoItem(n, "EB-1A");

    const { error } = await ganhar(duli, n);
    expect(error?.message).toBe(MSG.naoEncontrado);
    expect((await negocio(n)).status).toBe("open");
  });

  describe("dono e participantes", () => {
    it("pessoa sem dono recebe o dono do negócio", async () => {
      const p = await novaPessoa();
      const n = await novoNegocio(p.id, staffId);
      await novoItem(n, "EB-1A");

      expect((await ganhar(parceiro, n)).error).toBeNull();
      expect((await pessoa(p.id)).owner_id).toBe(staffId);
    });

    it("cliente que já existe não muda dono nem data, mas ganha processos e participantes", async () => {
      const p = await novaPessoa({
        lifecycle_stage: "client",
        owner_id: parceiroId,
        client_since: "2025-01-15",
      });
      const n = await novoNegocio(p.id, staffId);
      await novoItem(n, "EB-1A");
      await parceiro
        .from("opportunity_participants")
        .insert({ organization_id: org, opportunity_id: n, user_id: staffId });

      expect((await ganhar(parceiro, n)).error).toBeNull();
      expect(await pessoa(p.id)).toEqual({
        lifecycle_stage: "client",
        client_since: "2025-01-15",
        owner_id: parceiroId,
      });
      expect(await processosDo(n)).toHaveLength(1);

      const { data: participantes } = await parceiro
        .from("person_participants")
        .select("user_id")
        .eq("person_id", p.id);
      expect(participantes).toEqual([{ user_id: staffId }]);
      expect(await historico(p.id)).toContainEqual({
        type: "stage_change",
        description: "Oportunidade ganha",
      });
    });

    it("cliente que já existe sem dono continua sem dono", async () => {
      const p = await novaPessoa({ lifecycle_stage: "client" });
      const n = await novoNegocio(p.id, staffId);
      await novoItem(n, "EB-1A");

      expect((await ganhar(parceiro, n)).error).toBeNull();
      expect((await pessoa(p.id)).owner_id).toBeNull();
    });

    it("participante do negócio que já participa da pessoa não duplica", async () => {
      const p = await novaPessoa();
      const n = await novoNegocio(p.id, parceiroId);
      await novoItem(n, "EB-1A");
      await parceiro
        .from("person_participants")
        .insert({ organization_id: org, person_id: p.id, user_id: staffId });
      await parceiro
        .from("opportunity_participants")
        .insert({ organization_id: org, opportunity_id: n, user_id: staffId });

      expect((await ganhar(parceiro, n)).error).toBeNull();
      const { data: participantes } = await parceiro
        .from("person_participants")
        .select("user_id")
        .eq("person_id", p.id);
      expect(participantes).toEqual([{ user_id: staffId }]);
    });
  });

  it("visto desativado ganha mesmo assim, com o molde dele", async () => {
    const p = await novaPessoa();
    const n = await novoNegocio(p.id, parceiroId);
    await novoItem(n, "EB-1A");

    try {
      await parceiro.from("visa_types").update({ is_active: false }).eq("id", vistoId);
      const { error } = await ganhar(parceiro, n);
      expect(error).toBeNull();
      const processos = await processosDo(n);
      expect(processos).toHaveLength(1);
      const etapas = await parceiro.from("project_stages").select("id").eq("project_id", processos[0]!.id);
      const pastas = await parceiro.from("project_documents").select("id").eq("project_id", processos[0]!.id);
      expect(etapas.data!.length).toBeGreaterThan(0);
      expect(pastas.data!.length).toBeGreaterThan(0);
    } finally {
      await parceiro.from("visa_types").update({ is_active: true }).eq("id", vistoId);
    }
  });

  describe("tipo de visto apagado depois do Ganho", () => {
    it("o item guarda o nome, e o processo fica sem tipo", async () => {
      const visto = await novoVisto();
      const p = await novaPessoa();
      const n = await novoNegocio(p.id, parceiroId);
      const item = await novoItem(n, "Visto que some", { visa_type_id: visto });
      expect((await ganhar(parceiro, n)).error).toBeNull();

      const apagado = await parceiro.from("visa_types").delete().eq("id", visto).select("id");
      expect(apagado.error).toBeNull();
      expect(apagado.data).toHaveLength(1);

      const { data: restou } = await parceiro
        .from("opportunity_items")
        .select("visa_type_id, visa_name")
        .eq("id", item)
        .single();
      expect(restou).toEqual({ visa_type_id: null, visa_name: "Visto que some" });
      expect((await processosDo(n))[0]!.visa_type_id).toBeNull();
    });

    it("item com processo que perdeu o visto não impede ganhar de novo", async () => {
      const visto = await novoVisto();
      const p = await novaPessoa();
      const n = await novoNegocio(p.id, parceiroId);
      await novoItem(n, "Visto que some", { visa_type_id: visto });
      expect((await ganhar(parceiro, n)).error).toBeNull();

      await parceiro.from("visa_types").delete().eq("id", visto);
      expect((await reabrir(parceiro, n)).error).toBeNull();

      const { data, error } = await ganhar(parceiro, n);
      expect(error).toBeNull();
      expect(lerResumo(data).processos).toEqual([]);
      expect(await processosDo(n)).toHaveLength(1);
    });
  });
});
