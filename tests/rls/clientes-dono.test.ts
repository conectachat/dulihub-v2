// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { entrarComo, fixture, type Cliente } from "./clientes";

/**
 * Dono e participantes do cliente e da oportunidade (0044; CLI-10).
 *
 * - `people.owner_id` só aceita membro da organização da pessoa: a chave
 *   estrangeira é composta com `organization_members`.
 * - `person_participants` e `opportunity_participants`: os membros da
 *   organização gravam e leem; outra organização não lê.
 * - O dono do negócio só é trocado pelo dono atual ou pela gestão.
 * - O cliente do portal não muda o próprio dono: a mudança é desfeita em
 *   silêncio, como o resto do que ele não pode mudar (0013).
 *
 * "Remover o membro anula o dono" não é teste desta suíte, que só fala com
 * o PostgREST: foi conferido no catálogo (`pg_constraint`) e está no
 * `docs/banco.md`.
 *
 * Grava só na organização de teste, numa pessoa descartável, e a apaga no
 * fim. A exceção é o teste do portal, que só pode usar o "Cliente de Teste"
 * (é a única pessoa com login de cliente): o valor é guardado antes e
 * restaurado em `finally`.
 */

const s = crypto.randomUUID().replace(/\D/g, "").slice(0, 8).padEnd(8, "0");

const FRASE_DO_DONO = "Só o dono do negócio ou a gestão trocam o dono.";

describe("dono e participantes (0044)", () => {
  let parceiro: Cliente;
  let staff: Cliente;
  let duli: Cliente;
  let portal: Cliente;
  let org: string;
  let parceiroId: string;
  let staffId: string;
  let colaboradorId: string;
  let pessoa = "";
  let negocio = "";

  beforeAll(async () => {
    [parceiro, staff, duli, portal] = await Promise.all([
      entrarComo("parceiro"),
      entrarComo("staff"),
      entrarComo("colaborador"),
      entrarComo("cliente"),
    ]);
    org = (await fixture(parceiro)).organization_id;
    parceiroId = (await parceiro.auth.getUser()).data.user!.id;
    staffId = (await staff.auth.getUser()).data.user!.id;
    colaboradorId = (await duli.auth.getUser()).data.user!.id;

    const { data: criada, error } = await parceiro
      .from("people")
      .insert({
        organization_id: org,
        full_name: `Dono ${s}`,
        email: `dono.${s}@teste.dulihub`,
        phone_country_code: "+55",
        phone: `31${s}`,
        lifecycle_stage: "opportunity",
      })
      .select("id")
      .single();
    if (error) throw new Error(`Pessoa descartável não criada: ${error.message}`);
    pessoa = criada.id;

    const { data: funil, error: erroFunil } = await parceiro
      .from("pipelines")
      .select("id")
      .eq("organization_id", org)
      .eq("is_default", true)
      .single();
    if (erroFunil) throw new Error(`Funil ilegível: ${erroFunil.message}`);
    const { data: etapas, error: erroEtapas } = await parceiro
      .from("pipeline_stages")
      .select("id, is_won, is_lost, position")
      .eq("pipeline_id", funil.id)
      .order("position");
    if (erroEtapas) throw new Error(`Etapas ilegíveis: ${erroEtapas.message}`);
    const aberta = etapas.find((e) => !e.is_won && !e.is_lost)!.id;

    const { data: resposta, error: erroNegocio } = await parceiro.rpc("criar_oportunidade", {
      p_etapa: aberta,
      p_titulo: `Negócio ${s}`,
      p_confirmar_contato_parecido: true,
      p_confirmar_outra_oportunidade: true,
      p_contato: pessoa,
    });
    if (erroNegocio) throw new Error(`Negócio não criado: ${erroNegocio.message}`);
    negocio = (resposta as { negocio: string }).negocio;
  }, 60_000);

  afterAll(async () => {
    if (!pessoa) return;
    await parceiro.from("opportunities").delete().eq("person_id", pessoa);
    await parceiro.from("people").delete().eq("id", pessoa);
  });

  describe("dono do cliente", () => {
    it("aceita um membro da organização da pessoa", async () => {
      const { data, error } = await parceiro
        .from("people")
        .update({ owner_id: staffId })
        .eq("id", pessoa)
        .select("owner_id")
        .single();

      expect(error).toBeNull();
      expect(data?.owner_id).toBe(staffId);
    });

    it("recusa quem é membro de outra organização", async () => {
      const { error } = await parceiro
        .from("people")
        .update({ owner_id: colaboradorId })
        .eq("id", pessoa);

      expect(error?.code).toBe("23503");
    });

    it("o cliente do portal não muda o próprio dono: desfeito em silêncio", async () => {
      const cliente = await fixture(parceiro);
      const { data: antes, error: erroAntes } = await parceiro
        .from("people")
        .select("owner_id")
        .eq("id", cliente.id)
        .single();
      expect(erroAntes).toBeNull();
      // Um membro válido da parceira e diferente do atual: se a trava
      // falhar, aparece como mudança, não como 23503.
      const outro = antes!.owner_id === staffId ? parceiroId : staffId;

      try {
        const { error } = await portal
          .from("people")
          .update({ owner_id: outro })
          .eq("id", cliente.id);
        expect(error).toBeNull();

        const { data: depois } = await parceiro
          .from("people")
          .select("owner_id")
          .eq("id", cliente.id)
          .single();
        expect(depois?.owner_id).toBe(antes!.owner_id);
      } finally {
        await parceiro.from("people").update({ owner_id: antes!.owner_id }).eq("id", cliente.id);
      }
    });
  });

  describe("participantes do cliente", () => {
    it("o membro grava e lê; outra organização não lê; repetido é recusado", async () => {
      const { error } = await parceiro
        .from("person_participants")
        .insert({ organization_id: org, person_id: pessoa, user_id: staffId });
      expect(error).toBeNull();

      const { data: lidos } = await staff
        .from("person_participants")
        .select("user_id")
        .eq("person_id", pessoa);
      expect(lidos).toEqual([{ user_id: staffId }]);

      const { data: deFora, error: erroDeFora } = await duli
        .from("person_participants")
        .select("id")
        .eq("person_id", pessoa);
      expect(erroDeFora).toBeNull();
      expect(deFora).toEqual([]);

      const repetido = await parceiro
        .from("person_participants")
        .insert({ organization_id: org, person_id: pessoa, user_id: staffId });
      expect(repetido.error?.code).toBe("23505");
    });

    it("participante de outra organização é recusado", async () => {
      const { error } = await parceiro
        .from("person_participants")
        .insert({ organization_id: org, person_id: pessoa, user_id: colaboradorId });

      expect(error?.code).toBe("23503");
    });
  });

  describe("participantes da oportunidade", () => {
    it("o membro grava e lê; outra organização não lê; repetido é recusado", async () => {
      const { error } = await parceiro
        .from("opportunity_participants")
        .insert({ organization_id: org, opportunity_id: negocio, user_id: staffId });
      expect(error).toBeNull();

      const { data: lidos } = await staff
        .from("opportunity_participants")
        .select("user_id")
        .eq("opportunity_id", negocio);
      expect(lidos).toEqual([{ user_id: staffId }]);

      const { data: deFora, error: erroDeFora } = await duli
        .from("opportunity_participants")
        .select("id")
        .eq("opportunity_id", negocio);
      expect(erroDeFora).toBeNull();
      expect(deFora).toEqual([]);

      const repetido = await parceiro
        .from("opportunity_participants")
        .insert({ organization_id: org, opportunity_id: negocio, user_id: staffId });
      expect(repetido.error?.code).toBe("23505");
    });
  });

  describe("dono do negócio", () => {
    it("quem não é o dono nem da gestão não troca o dono", async () => {
      const { error } = await staff
        .from("opportunities")
        .update({ owner_id: staffId })
        .eq("id", negocio);

      expect(error?.code).toBe("P0001");
      expect(error?.message).toBe(FRASE_DO_DONO);
    });

    it("repetir o mesmo dono passa, porque nada muda", async () => {
      const { error } = await staff
        .from("opportunities")
        .update({ owner_id: parceiroId, title: `Negócio ${s}` })
        .eq("id", negocio);

      expect(error).toBeNull();
    });

    it("a gestão troca o dono, e o dono novo pode passá-lo adiante", async () => {
      const daGestao = await parceiro
        .from("opportunities")
        .update({ owner_id: staffId })
        .eq("id", negocio)
        .select("owner_id")
        .single();
      expect(daGestao.error).toBeNull();
      expect(daGestao.data?.owner_id).toBe(staffId);

      const doDono = await staff
        .from("opportunities")
        .update({ owner_id: parceiroId })
        .eq("id", negocio)
        .select("owner_id")
        .single();
      expect(doDono.error).toBeNull();
      expect(doDono.data?.owner_id).toBe(parceiroId);
    });
  });
});
