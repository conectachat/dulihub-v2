// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { aplicarEtapa, etapaTerminal, type EtapaDeDestino } from "@/features/opportunities/mover";

import { entrarComo, type Cliente } from "./clientes";

/**
 * Mover, ganhar e perder um negócio — contra o banco de verdade.
 *
 * O Ganho é o que transforma o lead em cliente e libera o perfil completo
 * (processos, financeiro). O Perdido guarda o motivo. As duas coisas são
 * gravações em mais de uma tabela, e é aqui que se prova que elas saem
 * coerentes — e que uma organização não move o negócio da outra.
 *
 * As Server Actions (`actions.ts`) só acrescentam sessão e revalidação por
 * cima destas funções, que recebem o cliente pronto: é o que as deixa
 * testáveis fora do Next.
 */

describe("funil: mover, ganhar e perder", () => {
  let parceiro: Cliente;
  let duli: Cliente;
  let usuario: string;
  let orgParceiro: string;
  let pessoaId: string;
  let negocioId: string;
  let meio: EtapaDeDestino;

  const negocio = () =>
    parceiro
      .from("opportunities")
      .select("stage_id, status, closed_at, lost_reason")
      .eq("id", negocioId)
      .single();

  const estagio = async () =>
    (await parceiro.from("people").select("lifecycle_stage").eq("id", pessoaId).single()).data
      ?.lifecycle_stage;

  beforeAll(async () => {
    parceiro = await entrarComo("parceiro");
    duli = await entrarComo("colaborador");
    usuario = (await parceiro.auth.getUser()).data.user!.id;

    const { data: membro } = await parceiro
      .from("organization_members")
      .select("organization_id")
      .limit(1)
      .single();
    orgParceiro = membro!.organization_id;

    const { data: funil, error: erroFunil } = await parceiro
      .from("pipelines")
      .select("id")
      .eq("organization_id", orgParceiro)
      .eq("is_default", true)
      .single();
    if (erroFunil) throw new Error(`Funil do parceiro ilegível: ${erroFunil.message}`);

    // Em duas leituras: etapa e funil têm duas chaves entre si (a simples e a
    // composta da 0027), e o embutido não sabe qual seguir.
    const { data: etapas, error: erroEtapas } = await parceiro
      .from("pipeline_stages")
      .select("id, name, probability, is_won, is_lost, position")
      .eq("pipeline_id", funil.id);
    if (erroEtapas) throw new Error(`Etapas ilegíveis: ${erroEtapas.message}`);

    const doMeio = etapas
      .filter((e) => !e.is_won && !e.is_lost)
      .sort((a, b) => a.position - b.position)[0];
    if (!doMeio) throw new Error("O funil do parceiro não tem etapa aberta.");
    meio = doMeio;

    const { data: pessoa, error: erroPessoa } = await parceiro
      .from("people")
      .insert({
        organization_id: orgParceiro,
        full_name: `Lead do funil ${crypto.randomUUID().slice(0, 8)}`,
        lifecycle_stage: "opportunity",
      })
      .select("id")
      .single();
    if (erroPessoa) throw new Error(`Lead não criado: ${erroPessoa.message}`);
    pessoaId = pessoa.id;

    const { data: criado, error: erroNegocio } = await parceiro
      .from("opportunities")
      .insert({
        organization_id: orgParceiro,
        person_id: pessoaId,
        pipeline_id: funil.id,
        stage_id: meio.id,
        title: "Negócio da suíte",
      })
      .select("id")
      .single();
    if (erroNegocio) throw new Error(`Negócio não criado: ${erroNegocio.message}`);
    negocioId = criado.id;
  }, 60_000);

  afterAll(async () => {
    // A chave em cascata leva o negócio e o histórico junto.
    if (pessoaId) await parceiro.from("people").delete().eq("id", pessoaId);
  });

  it("perder guarda o motivo, fecha o negócio e registra no histórico", async () => {
    const { etapa } = await etapaTerminal(parceiro, negocioId, "is_lost");
    expect(etapa?.is_lost).toBe(true);

    const r = await aplicarEtapa(parceiro, usuario, negocioId, etapa!, "Preço — achou caro");
    expect(r.error).toBeNull();

    const { data } = await negocio();
    expect(data?.status).toBe("lost");
    expect(data?.closed_at).not.toBeNull();
    expect(data?.lost_reason).toBe("Preço — achou caro");

    const { data: historico } = await parceiro
      .from("activities")
      .select("description")
      .eq("opportunity_id", negocioId)
      .eq("type", "stage_change");
    expect(historico?.map((h) => h.description)).toContain(
      `Movida para ${etapa!.name} — motivo: Preço — achou caro`,
    );

    // Perder não faz de ninguém cliente.
    expect(await estagio()).toBe("opportunity");
  });

  it("reabrir apaga o motivo — negócio aberto não carrega perda que não vale mais", async () => {
    const r = await aplicarEtapa(parceiro, usuario, negocioId, meio, null);
    expect(r.error).toBeNull();

    const { data } = await negocio();
    expect(data).toMatchObject({
      stage_id: meio.id,
      status: "open",
      closed_at: null,
      lost_reason: null,
    });
  });

  it("a Duli não move o negócio do parceiro", async () => {
    const usuarioDuli = (await duli.auth.getUser()).data.user!.id;

    // Nem enxerga o funil dele para achar a etapa de ganho…
    const busca = await etapaTerminal(duli, negocioId, "is_won");
    expect(busca.etapa).toBeNull();
    expect(busca.error).not.toBeNull();

    // …nem grava, sabendo a etapa: a policy filtra, e zero linhas é recusa.
    const { etapa } = await etapaTerminal(parceiro, negocioId, "is_won");
    const r = await aplicarEtapa(duli, usuarioDuli, negocioId, etapa!, null);
    expect(r.error).not.toBeNull();

    expect((await negocio()).data?.status).toBe("open");
    expect(await estagio()).toBe("opportunity");
  });

  it("ganhar fecha o negócio e faz do lead um cliente", async () => {
    const { etapa } = await etapaTerminal(parceiro, negocioId, "is_won");
    expect(etapa?.is_won).toBe(true);

    const r = await aplicarEtapa(parceiro, usuario, negocioId, etapa!, null);
    expect(r).toEqual({ error: null, personId: pessoaId });

    const { data } = await negocio();
    expect(data?.status).toBe("won");
    expect(data?.closed_at).not.toBeNull();
    expect(data?.lost_reason).toBeNull();
    expect(await estagio()).toBe("client");
  });

  it("cliente não volta a ser lead, mesmo com o negócio reaberto", async () => {
    await aplicarEtapa(parceiro, usuario, negocioId, meio, null);

    expect((await negocio()).data?.status).toBe("open");
    expect(await estagio()).toBe("client");
  });
});
