// @vitest-environment node

import { beforeAll, describe, expect, it } from "vitest";

import { entrarComo, type Cliente } from "./clientes";

/**
 * Configuração é estrutura, não conteúdo do dia a dia.
 *
 * Apagar um contato tira um contato. Apagar uma pasta do catálogo tira a
 * exigência de todos os vistos que a usavam; apagar uma etapa mexe no funil de
 * todo mundo. Até aqui qualquer membro podia fazer as duas coisas — a policy
 * conferia associação, nunca papel.
 *
 * O colaborador da fixture tem papel `staff` justamente para provar a
 * diferença.
 */

/**
 * Recusa **da RLS**, e só dela.
 *
 * Inserir contra a policy dá erro `42501`; apagar ou alterar o que a policy
 * esconde não dá erro nenhum, só zero linhas. Qualquer outro erro — coluna
 * faltando, chave estrangeira — NÃO conta: aceitar "qualquer erro" deixou um
 * teste do portal passando por falta de coluna, sem nunca chegar na policy.
 */
function recusou(resposta: {
  data: unknown[] | null;
  error: { code?: string } | null;
}) {
  if (resposta.error) return resposta.error.code === "42501";
  return (resposta.data ?? []).length === 0;
}

describe("colaborador lê a configuração, e não a altera", () => {
  let staff: Cliente;
  let organizationId: string;

  beforeAll(async () => {
    staff = await entrarComo("colaborador");
    const { data } = await staff
      .from("organization_members")
      .select("organization_id")
      .limit(1)
      .maybeSingle();
    organizationId = data!.organization_id;
  }, 30_000);

  it("lê o catálogo inteiro", async () => {
    const { data, error } = await staff.from("document_types").select("id");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("não cria pasta no catálogo", async () => {
    const resposta = await staff
      .from("document_types")
      .insert({ organization_id: organizationId, name: "Pasta do colaborador" })
      .select("id");

    expect(recusou(resposta)).toBe(true);
  });

  it("não apaga tipo de visto", async () => {
    const { data: visto } = await staff
      .from("visa_types")
      .select("id")
      .limit(1)
      .maybeSingle();

    const resposta = await staff
      .from("visa_types")
      .delete()
      .eq("id", visto!.id)
      .select("id");

    expect(recusou(resposta)).toBe(true);
  });

  it("não cria etapa no funil", async () => {
    const { data: funil } = await staff
      .from("pipelines")
      .select("id")
      .limit(1)
      .maybeSingle();

    const resposta = await staff
      .from("pipeline_stages")
      .insert({ pipeline_id: funil!.id, name: "Etapa do colaborador", position: 50 })
      .select("id");

    expect(recusou(resposta)).toBe(true);
  });

  it("não cria tag", async () => {
    const resposta = await staff
      .from("tags")
      .insert({ organization_id: organizationId, name: "Tag do colaborador" })
      .select("id");

    expect(recusou(resposta)).toBe(true);
  });

  it("continua criando contato, que é o trabalho dele", async () => {
    const { data, error } = await staff
      .from("people")
      .insert({ organization_id: organizationId, full_name: "Contato do colaborador" })
      .select("id");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    // Limpa: o teste não pode engordar a carteira do Renato a cada execução.
    await staff.from("people").delete().eq("id", data![0].id);
  });
});

describe("organização nova nasce utilizável", () => {
  let parceiro: Cliente;

  beforeAll(async () => {
    parceiro = await entrarComo("parceiro");
  }, 30_000);

  // Sem isto o parceiro entra num app quebrado: `createOpportunity` exige uma
  // etapa existente, e o funil padrão só era semeado para o slug 'duli'.
  it("tem funil padrão", async () => {
    const { data, error } = await parceiro
      .from("pipelines")
      .select("id, is_default");

    expect(error).toBeNull();
    expect(data!.filter((p) => p.is_default)).toHaveLength(1);
  });

  it("tem as três etapas de fábrica, com ganho e perdido", async () => {
    const { data, error } = await parceiro
      .from("pipeline_stages")
      .select("name, is_won, is_lost");

    expect(error).toBeNull();
    expect(data).toHaveLength(3);
    expect(data!.filter((e) => e.is_won)).toHaveLength(1);
    expect(data!.filter((e) => e.is_lost)).toHaveLength(1);
  });

  it("tem os três status de etapa de fábrica", async () => {
    const { data, error } = await parceiro
      .from("stage_statuses")
      .select("code, is_default, is_done");

    expect(error).toBeNull();
    expect(data!.map((s) => s.code).sort()).toEqual([
      "done",
      "in_progress",
      "pending",
    ]);
    expect(data!.filter((s) => s.is_default)).toHaveLength(1);
    expect(data!.filter((s) => s.is_done)).toHaveLength(1);
  });
});
