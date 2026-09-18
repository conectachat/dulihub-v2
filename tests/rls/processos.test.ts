// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { entrarComo, fixture, type Cliente } from "./clientes";

/**
 * Processo: a cópia do molde e quem enxerga o quê.
 *
 * Roda inteiro dentro da organização de teste. O "Visto do Parceiro" tem, pela
 * fixture `0021`, etapas com sub-etapa e um catálogo em três níveis
 * (Pasta › Meio › Folha) onde o visto exige a Pasta e a Folha, **não** o Meio —
 * é o caso do pai visível: no processo, a Folha tem de ficar pendurada na
 * Pasta, e não sumir nem virar raiz.
 *
 * Cada execução cria um processo e o apaga no fim.
 */

describe("processo criado a partir do molde", () => {
  let parceiro: Cliente;
  let duli: Cliente;
  let pessoaId: string;
  let vistoId: string;
  let orgParceiro: string;
  let processoId: string;
  const arquivosCriados: string[] = [];

  beforeAll(async () => {
    parceiro = await entrarComo("parceiro");
    duli = await entrarComo("colaborador");

    const pessoa = await fixture(parceiro);
    pessoaId = pessoa.id;
    orgParceiro = pessoa.organization_id;

    const { data: visto, error: erroVisto } = await parceiro
      .from("visa_types")
      .select("id")
      .eq("name", "Visto do Parceiro")
      .maybeSingle();
    if (erroVisto) throw new Error(`Visto da fixture ilegível: ${erroVisto.message}`);
    if (!visto) throw new Error("Visto da fixture não existe. Aplique a 0021.");
    vistoId = visto.id;

    const { data, error } = await parceiro.rpc("criar_processo", {
      p_person: pessoaId,
      p_visa_type: vistoId,
      p_title: "Processo da suíte",
    });
    if (error) throw new Error(`criar_processo falhou: ${error.message}`);
    processoId = data as string;
  }, 60_000);

  afterAll(async () => {
    if (arquivosCriados.length) {
      await parceiro.storage.from("documentos").remove(arquivosCriados);
    }
    if (processoId) {
      await parceiro.from("projects").delete().eq("id", processoId);
    }
  });

  it("copia a árvore de etapas, com a sub-etapa debaixo da mãe", async () => {
    const { data, error } = await parceiro
      .from("project_stages")
      .select("id, parent_id, name, status_id")
      .eq("project_id", processoId);

    expect(error).toBeNull();
    const por = (nome: string) => data!.find((e) => e.name === nome)!;

    expect(data!.map((e) => e.name).sort()).toEqual([
      "Etapa A",
      "Etapa B",
      "Sub-etapa A1",
    ]);
    expect(por("Etapa A").parent_id).toBeNull();
    expect(por("Sub-etapa A1").parent_id).toBe(por("Etapa A").id);
  });

  it("toda etapa nasce com o status padrão da organização", async () => {
    const { data: padrao } = await parceiro
      .from("stage_statuses")
      .select("id")
      .eq("is_default", true)
      .maybeSingle();
    const { data } = await parceiro
      .from("project_stages")
      .select("status_id")
      .eq("project_id", processoId);

    expect(new Set(data!.map((e) => e.status_id))).toEqual(new Set([padrao!.id]));
  });

  it("copia só as pastas que o visto exige, com o pai visível", async () => {
    const { data, error } = await parceiro
      .from("project_documents")
      .select("id, parent_id, name, is_required, deadline_on, source_document_type_id")
      .eq("project_id", processoId);

    expect(error).toBeNull();
    const por = (nome: string) => data!.find((p) => p.name === nome)!;

    expect(data!.map((p) => p.name).sort()).toEqual([
      "Folha do Parceiro",
      "Opcional do Parceiro",
      "Pasta do Parceiro",
    ]);
    // O Meio não é exigido: a Folha sobe até a Pasta em vez de sumir.
    expect(por("Folha do Parceiro").parent_id).toBe(por("Pasta do Parceiro").id);
    expect(por("Pasta do Parceiro").parent_id).toBeNull();
    expect(por("Opcional do Parceiro").is_required).toBe(false);
    // Toda pasta copiada lembra de onde veio.
    expect(data!.every((p) => p.source_document_type_id !== null)).toBe(true);
  });

  it("calcula o prazo a partir do início do processo", async () => {
    const { data: processo } = await parceiro
      .from("projects")
      .select("started_on")
      .eq("id", processoId)
      .maybeSingle();
    const { data: pasta } = await parceiro
      .from("project_documents")
      .select("deadline_on")
      .eq("project_id", processoId)
      .eq("name", "Pasta do Parceiro")
      .maybeSingle();

    const esperado = new Date(`${processo!.started_on}T00:00:00Z`);
    esperado.setUTCDate(esperado.getUTCDate() + 10);
    expect(pasta!.deadline_on).toBe(esperado.toISOString().slice(0, 10));
  });

  it("a Duli não enxerga o processo, nem as etapas, nem as pastas", async () => {
    const processo = await duli.from("projects").select("id").eq("id", processoId);
    const etapas = await duli
      .from("project_stages")
      .select("id")
      .eq("project_id", processoId);
    const pastas = await duli
      .from("project_documents")
      .select("id")
      .eq("project_id", processoId);

    for (const { data, error } of [processo, etapas, pastas]) {
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it("a Duli não cria processo para contato do parceiro", async () => {
    const { data, error } = await duli.rpc("criar_processo", {
      p_person: pessoaId,
      p_visa_type: vistoId,
      p_title: "Invasão",
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  describe("arquivos", () => {
    let pastaId: string;

    beforeAll(async () => {
      const { data } = await parceiro
        .from("project_documents")
        .select("id")
        .eq("project_id", processoId)
        .eq("name", "Pasta do Parceiro")
        .maybeSingle();
      pastaId = data!.id;
    });

    const caminho = (org: string, pasta = pastaId) =>
      `${org}/${processoId}/${pasta}/${crypto.randomUUID()}-teste.pdf`;
    const pdf = new Blob(["%PDF-1.4 teste"], { type: "application/pdf" });

    it("a organização dona sobe e registra", async () => {
      const onde = caminho(orgParceiro);
      const { error: erroUpload } = await parceiro.storage
        .from("documentos")
        .upload(onde, pdf);
      expect(erroUpload).toBeNull();
      arquivosCriados.push(onde);

      const { data, error } = await parceiro
        .from("document_files")
        .insert({
          organization_id: orgParceiro,
          project_id: processoId,
          project_document_id: pastaId,
          storage_path: onde,
          file_name: "teste.pdf",
          mime_type: "application/pdf",
          size_bytes: 14,
        })
        .select("id, review_status");

      expect(error).toBeNull();
      expect(data![0].review_status).toBe("pending");
    });

    it("a Duli não baixa nem lista o arquivo do parceiro", async () => {
      const [onde] = arquivosCriados;
      const { data } = await duli.storage.from("documentos").download(onde);
      expect(data).toBeNull();

      const { data: lista } = await duli.storage
        .from("documentos")
        .list(`${orgParceiro}/${processoId}`);
      expect(lista ?? []).toEqual([]);
    });

    it("o parceiro não sobe arquivo no espaço de outra organização", async () => {
      const { data: org } = await duli
        .from("organization_members")
        .select("organization_id")
        .limit(1)
        .maybeSingle();

      const { error } = await parceiro.storage
        .from("documentos")
        .upload(caminho(org!.organization_id), pdf);
      expect(error).not.toBeNull();
    });

    it("não registra arquivo com caminho de outra pasta", async () => {
      // O banco confere o caminho contra a pasta — mesma regra de
      // `caminhoPertence`, agora sem depender da aplicação lembrar.
      const { error } = await parceiro.from("document_files").insert({
        organization_id: orgParceiro,
        project_id: processoId,
        project_document_id: pastaId,
        storage_path: caminho(orgParceiro, crypto.randomUUID()),
        file_name: "x.pdf",
      });
      expect(error).not.toBeNull();
    });

    it("não recusa arquivo sem motivo", async () => {
      const { data: arquivo } = await parceiro
        .from("document_files")
        .select("id")
        .eq("project_id", processoId)
        .limit(1)
        .maybeSingle();

      const { error } = await parceiro
        .from("document_files")
        .update({ review_status: "rejected", rejection_reason: "" })
        .eq("id", arquivo!.id)
        .select("id");
      expect(error).not.toBeNull();
    });
  });
});
