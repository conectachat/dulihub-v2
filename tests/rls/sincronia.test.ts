// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { entrarComo, type Cliente } from "./clientes";

/**
 * O que o aparelho precisa para sincronizar sozinho (Fase 2.5, Estágio 1).
 *
 * Três coisas, e cada uma existe por um modo de falha concreto:
 *
 * - **Lápide** (`deleted_rows`): sem ela, uma linha apagada no servidor fica
 *   no espelho do aparelho **para sempre**, exibida como se existisse. É a
 *   pior falha desta arquitetura, porque não dá erro nenhum.
 * - **Manifesto** (`sync_manifesto`): contagem por tabela. É a rede que pega
 *   qualquer furo — marca d'água que pulou linha, lápide que expirou,
 *   acesso revogado.
 * - **Ordem absoluta** (`reordenar_irmaos`): trocar dois de lugar não é
 *   idempotente; repetir a mesma troca desfaz. Mandar a lista inteira é.
 *
 * E a lápide só sabe de quem é a linha apagada se a própria linha carregar
 * `organization_id` — numa exclusão em cascata a mãe já não existe quando o
 * gatilho da filha roda. Daí as três tabelas que ganharam a coluna.
 */

describe("sincronia offline", () => {
  let parceiro: Cliente;
  let duli: Cliente;
  let org: string;
  let funilId: string;
  const etapas: string[] = [];

  beforeAll(async () => {
    parceiro = await entrarComo("parceiro");
    duli = await entrarComo("colaborador");

    const { data: membro, error } = await parceiro
      .from("organization_members")
      .select("organization_id")
      .limit(1)
      .single();
    if (error) throw new Error(`Organização do parceiro ilegível: ${error.message}`);
    org = membro.organization_id;

    // Funil próprio do teste: apagar o padrão quebraria a fixture inteira.
    const { data: funil, error: erroFunil } = await parceiro
      .from("pipelines")
      .insert({ organization_id: org, name: "Funil da sincronia" })
      .select("id")
      .single();
    if (erroFunil) throw new Error(`Funil não criado: ${erroFunil.message}`);
    funilId = funil.id;

    for (const [i, nome] of ["Primeira", "Segunda", "Terceira"].entries()) {
      const { data, error: erroEtapa } = await parceiro
        .from("pipeline_stages")
        .insert({
          organization_id: org,
          pipeline_id: funilId,
          name: `${nome} da sincronia`,
          position: i,
        })
        .select("id")
        .single();
      if (erroEtapa) throw new Error(`Etapa não criada: ${erroEtapa.message}`);
      etapas.push(data.id);
    }
  }, 60_000);

  afterAll(async () => {
    if (funilId) await parceiro.from("pipelines").delete().eq("id", funilId);
  });

  describe("organização na própria linha", () => {
    it("etapa do funil não aceita organização diferente da do funil", async () => {
      // A mesma chave composta da 0016: filha de A não entra sob mãe de B.
      const { data: outra } = await duli
        .from("organization_members")
        .select("organization_id")
        .limit(1)
        .single();

      const { error } = await parceiro.from("pipeline_stages").insert({
        organization_id: outra!.organization_id,
        pipeline_id: funilId,
        name: "Etapa trocada",
        position: 90,
      });
      expect(error).not.toBeNull();
    });
  });

  describe("lápides", () => {
    it("apagar deixa rastro para a organização dona", async () => {
      const { data: etiqueta } = await parceiro
        .from("tags")
        .insert({ organization_id: org, name: `Tag da sincronia ${Date.now()}` })
        .select("id")
        .single();

      await parceiro.from("tags").delete().eq("id", etiqueta!.id);

      const { data, error } = await parceiro
        .from("deleted_rows")
        .select("tabela, id")
        .eq("id", etiqueta!.id);

      expect(error).toBeNull();
      expect(data).toEqual([{ tabela: "tags", id: etiqueta!.id }]);
    });

    it("cascata deixa rastro das filhas, não só da mãe", async () => {
      // É o caso que mais importa: apagar um funil leva as etapas, e o
      // aparelho precisa saber das etapas também.
      const { data: funil } = await parceiro
        .from("pipelines")
        .insert({ organization_id: org, name: "Funil de um teste só" })
        .select("id")
        .single();
      const { data: etapa } = await parceiro
        .from("pipeline_stages")
        .insert({
          organization_id: org,
          pipeline_id: funil!.id,
          name: "Etapa que vai junto",
          position: 0,
        })
        .select("id")
        .single();

      await parceiro.from("pipelines").delete().eq("id", funil!.id);

      const { data } = await parceiro
        .from("deleted_rows")
        .select("tabela, id")
        .in("id", [funil!.id, etapa!.id]);

      expect(data).toHaveLength(2);
      expect(data!.map((l) => l.tabela).sort()).toEqual(["pipeline_stages", "pipelines"]);
    });

    it("a Duli não lê a lápide do parceiro", async () => {
      const { data: etiqueta } = await parceiro
        .from("tags")
        .insert({ organization_id: org, name: `Tag invisível ${Date.now()}` })
        .select("id")
        .single();
      await parceiro.from("tags").delete().eq("id", etiqueta!.id);

      const { data, error } = await duli
        .from("deleted_rows")
        .select("id")
        .eq("id", etiqueta!.id);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("ninguém escreve na tabela de lápides pela API", async () => {
      // Lápide é registro do que o banco fez, não algo que o app declara.
      const inseriu = await parceiro
        .from("deleted_rows")
        .insert({ tabela: "tags", id: crypto.randomUUID(), organization_id: org });
      expect(inseriu.error?.code).toBe("42501");

      const alterou = await parceiro
        .from("deleted_rows")
        .update({ tabela: "outra" })
        .eq("organization_id", org)
        .select("id");
      expect(alterou.data ?? []).toEqual([]);

      const apagou = await parceiro
        .from("deleted_rows")
        .delete()
        .eq("organization_id", org)
        .select("id");
      expect(apagou.data ?? []).toEqual([]);
    });
  });

  it("remover etiqueta de um contato continua funcionando", async () => {
    // `person_tags` não tem coluna `id` — a chave é o par (pessoa, etiqueta).
    // O gatilho de lápide lê `old.id`, então pô-lo nesta tabela quebraria
    // esta operação do dia a dia. Ficou de fora (0029b), e este teste é o
    // que segura a decisão.
    const { data: pessoa } = await parceiro
      .from("people")
      .select("id")
      .limit(1)
      .single();
    const { data: etiqueta } = await parceiro
      .from("tags")
      .insert({ organization_id: org, name: `Etiqueta do vínculo ${Date.now()}` })
      .select("id")
      .single();

    const vinculou = await parceiro
      .from("person_tags")
      .insert({ organization_id: org, person_id: pessoa!.id, tag_id: etiqueta!.id })
      .select("person_id");
    expect(vinculou.error).toBeNull();

    const desvinculou = await parceiro
      .from("person_tags")
      .delete()
      .eq("person_id", pessoa!.id)
      .eq("tag_id", etiqueta!.id)
      .select("person_id");
    expect(desvinculou.error).toBeNull();
    expect(desvinculou.data).toHaveLength(1);

    await parceiro.from("tags").delete().eq("id", etiqueta!.id);
  });

  describe("manifesto", () => {
    it("conta por tabela, com o que cada um enxerga", async () => {
      const doParceiro = await parceiro.rpc("sync_manifesto");
      const daDuli = await duli.rpc("sync_manifesto");

      expect(doParceiro.error).toBeNull();
      expect(daDuli.error).toBeNull();

      const pessoas = (m: typeof doParceiro.data) =>
        m!.find((t) => t.tabela === "people")!;

      // O parceiro tem uma pessoa na fixture; a Duli tem a carteira inteira.
      expect(pessoas(doParceiro.data).linhas).toBe(1);
      expect(pessoas(daDuli.data).linhas).toBeGreaterThan(50);
    });

    it("traz o horizonte das lápides — antes dele, o aparelho recarrega tudo", async () => {
      const { data } = await parceiro.rpc("sync_manifesto");
      const horizonte = data!.find((t) => t.tabela === "deleted_rows");
      expect(horizonte).toBeDefined();
      expect(horizonte!.maximo_updated_at).not.toBeNull();
    });
  });

  describe("ordem absoluta", () => {
    const posicoes = async () => {
      const { data } = await parceiro
        .from("pipeline_stages")
        .select("id, position")
        .eq("pipeline_id", funilId)
        .order("position");
      return data!.map((e) => e.id);
    };

    it("grava a lista inteira na ordem recebida", async () => {
      const invertida = [...etapas].reverse();
      const { error } = await parceiro.rpc("reordenar_irmaos", {
        p_tabela: "pipeline_stages",
        p_ids: invertida,
      });
      expect(error).toBeNull();
      expect(await posicoes()).toEqual(invertida);
    });

    it("repetir a mesma lista não muda nada — ao contrário de trocar dois", async () => {
      const antes = await posicoes();
      await parceiro.rpc("reordenar_irmaos", { p_tabela: "pipeline_stages", p_ids: antes });
      expect(await posicoes()).toEqual(antes);
    });

    it("a Duli não reordena as etapas do parceiro", async () => {
      const { error } = await duli.rpc("reordenar_irmaos", {
        p_tabela: "pipeline_stages",
        p_ids: etapas,
      });
      expect(error).not.toBeNull();
    });

    it("tabela fora da lista é recusada", async () => {
      const { error } = await parceiro.rpc("reordenar_irmaos", {
        p_tabela: "profiles",
        p_ids: etapas,
      });
      expect(error).not.toBeNull();
    });
  });

  describe("relógio da sincronia", () => {
    it("aprovar documento passa a ser visível: document_files tem updated_at", async () => {
      // Sem esta coluna, a mudança de estado de um arquivo é invisível para
      // qualquer sincronia incremental — o aparelho nunca saberia.
      const { error } = await parceiro
        .from("document_files")
        .select("id, updated_at")
        .limit(1);
      expect(error).toBeNull();
    });

    it("alterar uma linha move o relógio dela", async () => {
      const { data: antes } = await parceiro
        .from("pipeline_stages")
        .select("updated_at")
        .eq("id", etapas[0])
        .single();

      await new Promise((r) => setTimeout(r, 1_100));
      await parceiro
        .from("pipeline_stages")
        .update({ name: `Primeira da sincronia ${Date.now()}` })
        .eq("id", etapas[0]);

      const { data: depois } = await parceiro
        .from("pipeline_stages")
        .select("updated_at")
        .eq("id", etapas[0])
        .single();

      expect(new Date(depois!.updated_at).getTime()).toBeGreaterThan(
        new Date(antes!.updated_at).getTime(),
      );
    });
  });
});
