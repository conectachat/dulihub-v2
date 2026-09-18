// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { entrarComo, fixture, type Cliente } from "./clientes";

/**
 * O portal do cliente é da Fase 6, e o buraco é de hoje.
 *
 * O cliente alcança as próprias linhas por `people.user_id`, e as policies das
 * tabelas filhas — `notes`, `activities`, `files`, `opportunities`,
 * `person_tags` — passam **só** por `can_access_person`, que é verdadeira para
 * ele. Nenhuma delas confere autoria, e nenhuma tem gatilho congelando coluna.
 *
 * Na prática: o cliente pode reescrever a nota que o consultor escreveu sobre
 * ele, apagá-la, e mudar a organização dona da linha. Nada na aplicação
 * impede — a aplicação nem sabe que existe esse caminho.
 *
 * Testar agora custa pouco. Descobrir na Fase 6, com o portal no ar, custa a
 * confiança de quem confiou o processo de imigração à Duli.
 */

const CORPO_ORIGINAL =
  "Nota escrita pelo consultor. O cliente não pode reescrever nem apagar.";

describe("o cliente do portal alcança o que é dele, e só isso", () => {
  let cliente: Cliente;
  let consultor: Cliente;
  let notaId: string;
  let pessoaId: string;

  beforeAll(async () => {
    cliente = await entrarComo("cliente");
    consultor = await entrarComo("parceiro");

    // Pela pessoa da fixture, não pelo texto da nota. Buscar pelo texto fazia
    // uma execução que deixasse o texto alterado derrubar todas as seguintes
    // com "não existe" — e o teste que deveria acusar a alteração nem rodava.
    const pessoa = await fixture(consultor);

    const { data, error } = await consultor
      .from("notes")
      .select("id, person_id")
      .eq("person_id", pessoa.id)
      .order("created_at")
      .limit(1)
      .maybeSingle();

    // O erro vem antes do "não existe". Descartá-lo foi o que escondeu a
    // causa real de uma falha no CI em 18/set: a nota estava lá o tempo todo.
    if (error) throw new Error(`Nota da fixture ilegível: ${error.message}`);
    if (!data) {
      throw new Error(
        "A nota da fixture não existe. Aplique 0015_fixture_de_teste.sql.",
      );
    }
    notaId = data.id;
    pessoaId = data.person_id;
  }, 30_000);

  afterAll(async () => {
    // Se algum teste falhar gravando, o próximo não pode herdar o estrago.
    await consultor
      .from("notes")
      .update({ body: CORPO_ORIGINAL })
      .eq("id", notaId);
  });

  it("enxerga a si mesmo, e mais ninguém", async () => {
    const { data, error } = await cliente.from("people").select("id, full_name");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(pessoaId);
  });

  it("lê a nota que o consultor escreveu sobre ele", async () => {
    // Ler é certo: é para isso que o portal existe.
    const { data, error } = await cliente
      .from("notes")
      .select("body")
      .eq("id", notaId)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data!.body).toBe(CORPO_ORIGINAL);
  });

  it("não reescreve a nota do consultor", async () => {
    const { data } = await cliente
      .from("notes")
      .update({ body: "Reescrito pelo cliente." })
      .eq("id", notaId)
      .select("id");

    expect(data ?? []).toEqual([]);

    const { data: depois } = await consultor
      .from("notes")
      .select("body")
      .eq("id", notaId)
      .maybeSingle();

    expect(depois!.body).toBe(CORPO_ORIGINAL);
  });

  it("não apaga a nota do consultor", async () => {
    const { data } = await cliente
      .from("notes")
      .delete()
      .eq("id", notaId)
      .select("id");

    expect(data ?? []).toEqual([]);

    const { count } = await consultor
      .from("notes")
      .select("id", { count: "exact", head: true })
      .eq("id", notaId);

    expect(count).toBe(1);
  });

  it("não muda a organização dona da nota", async () => {
    // Sem gatilho congelando a coluna, a `with check` não protege: ela valida
    // a linha resultante, e a linha resultante continua sendo de uma pessoa
    // que o cliente alcança.
    const { data } = await cliente
      .from("notes")
      .update({ organization_id: "00000000-0000-0000-0000-000000000000" })
      .eq("id", notaId)
      .select("id");

    expect(data ?? []).toEqual([]);
  });

  it("não abre oportunidade para si mesmo", async () => {
    const { data: pessoa } = await cliente
      .from("people")
      .select("organization_id")
      .eq("id", pessoaId)
      .maybeSingle();

    const { data: etapa } = await consultor
      .from("pipeline_stages")
      .select("id, pipeline_id")
      .limit(1)
      .maybeSingle();

    const resposta = await cliente
      .from("opportunities")
      .insert({
        organization_id: pessoa!.organization_id,
        person_id: pessoaId,
        pipeline_id: etapa!.pipeline_id,
        stage_id: etapa!.id,
        title: "Negócio inventado pelo cliente",
      })
      .select("id");

    expect(resposta.error !== null || (resposta.data ?? []).length === 0).toBe(
      true,
    );
  });

  it("não se etiqueta sozinho", async () => {
    const { data: tag } = await consultor
      .from("tags")
      .select("id")
      .limit(1)
      .maybeSingle();

    const { data: pessoa } = await cliente
      .from("people")
      .select("organization_id")
      .eq("id", pessoaId)
      .maybeSingle();

    // A linha vai completa, com a organização certa. Antes ela ia sem
    // `organization_id` — obrigatório desde a 0016 — e o banco recusava por
    // falta de coluna: o teste passava sem nunca chegar na policy. Os tipos
    // gerados apontaram isso em 18/set.
    const resposta = await cliente
      .from("person_tags")
      .insert({
        person_id: pessoaId,
        tag_id: tag!.id,
        organization_id: pessoa!.organization_id,
      })
      .select("person_id");

    // Recusa pela policy de escrita: código 42501, não violação de coluna.
    expect(resposta.data ?? []).toEqual([]);
    expect(resposta.error?.code).toBe("42501");
  });
});
