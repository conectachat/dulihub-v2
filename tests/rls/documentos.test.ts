// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { entrarComo, fixture, type Cliente } from "./clientes";

/**
 * Pasta resolvida — a regra do Renato (19/set): só resolve com todos os
 * arquivos aprovados. Arquivo em análise ou recusado bloqueia, e arquivo novo
 * numa pasta resolvida a reabre.
 *
 * A regra mora no banco para valer mesmo se a tela falhar, e para o portal do
 * cliente (Fase 6) herdar sem reescrever.
 */

describe("pasta resolvida", () => {
  let parceiro: Cliente;
  let duli: Cliente;
  let org: string;
  let processoId: string;
  let pastaId: string;
  let outraPastaId: string;
  const objetos: string[] = [];

  const pdf = new Blob(["%PDF-1.4 teste"], { type: "application/pdf" });

  /** Sobe e registra um arquivo na pasta; devolve o id da linha. */
  async function enviar(pasta = pastaId) {
    const caminho = `${org}/${processoId}/${pasta}/${crypto.randomUUID()}-teste.pdf`;
    const subiu = await parceiro.storage.from("documentos").upload(caminho, pdf);
    if (subiu.error) throw new Error(`upload: ${subiu.error.message}`);
    objetos.push(caminho);
    const { data, error } = await parceiro
      .from("document_files")
      .insert({
        organization_id: org,
        project_id: processoId,
        project_document_id: pasta,
        storage_path: caminho,
        file_name: "teste.pdf",
        mime_type: "application/pdf",
        size_bytes: 14,
      })
      .select("id")
      .single();
    if (error) throw new Error(`registro: ${error.message}`);
    return data.id;
  }

  const resolver = (pasta = pastaId) =>
    parceiro
      .from("project_documents")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", pasta)
      .select("resolved_at");

  const estadoDaPasta = async (pasta = pastaId) =>
    (
      await parceiro
        .from("project_documents")
        .select("resolved_at")
        .eq("id", pasta)
        .single()
    ).data!.resolved_at;

  beforeAll(async () => {
    parceiro = await entrarComo("parceiro");
    duli = await entrarComo("colaborador");
    const pessoa = await fixture(parceiro);
    org = pessoa.organization_id;

    const { data: visto } = await parceiro
      .from("visa_types")
      .select("id")
      .eq("name", "Visto do Parceiro")
      .single();
    const { data, error } = await parceiro.rpc("criar_processo", {
      p_person: pessoa.id,
      p_visa_type: visto!.id,
      p_title: "Processo dos documentos",
    });
    if (error) throw new Error(`criar_processo: ${error.message}`);
    processoId = data;

    const { data: pastas } = await parceiro
      .from("project_documents")
      .select("id, name")
      .eq("project_id", processoId);
    pastaId = pastas!.find((p) => p.name === "Pasta do Parceiro")!.id;
    outraPastaId = pastas!.find((p) => p.name === "Opcional do Parceiro")!.id;
  }, 60_000);

  afterAll(async () => {
    if (objetos.length) await parceiro.storage.from("documentos").remove(objetos);
    if (processoId) await parceiro.from("projects").delete().eq("id", processoId);
  });

  it("pasta sem arquivo resolve", async () => {
    const { error } = await resolver(outraPastaId);
    expect(error).toBeNull();
  });

  it("arquivo em análise bloqueia", async () => {
    await enviar();
    const { data, error } = await resolver();
    expect(data).toBeNull();
    expect(error?.message).toMatch(/em análise ou recusados/);
  });

  it("arquivo recusado também bloqueia", async () => {
    const { data: arquivo } = await parceiro
      .from("document_files")
      .select("id")
      .eq("project_document_id", pastaId)
      .single();
    await parceiro
      .from("document_files")
      .update({ review_status: "rejected", rejection_reason: "Documento ilegível, envie outro." })
      .eq("id", arquivo!.id);

    const { error } = await resolver();
    expect(error?.message).toMatch(/em análise ou recusados/);
  });

  it("com todos aprovados, resolve", async () => {
    const { data: arquivo } = await parceiro
      .from("document_files")
      .select("id")
      .eq("project_document_id", pastaId)
      .single();
    await parceiro
      .from("document_files")
      .update({
        review_status: "approved",
        rejection_reason: null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", arquivo!.id);

    const { error } = await resolver();
    expect(error).toBeNull();
    expect(await estadoDaPasta()).not.toBeNull();
  });

  it("recusar depois um arquivo aprovado reabre a pasta", async () => {
    const { data: arquivo } = await parceiro
      .from("document_files")
      .select("id")
      .eq("project_document_id", pastaId)
      .single();
    await parceiro
      .from("document_files")
      .update({ review_status: "rejected", rejection_reason: "Venceu, envie a versão nova." })
      .eq("id", arquivo!.id);
    expect(await estadoDaPasta()).toBeNull();

    // Volta a aprovado e resolve, para o próximo teste partir do resolvido.
    await parceiro
      .from("document_files")
      .update({ review_status: "approved", rejection_reason: null })
      .eq("id", arquivo!.id);
    expect((await resolver()).error).toBeNull();
  });

  it("arquivo novo numa pasta resolvida a reabre", async () => {
    await enviar();
    expect(await estadoDaPasta()).toBeNull();
  });

  it("a Duli não resolve pasta do parceiro — e o zero é visível", async () => {
    const { data, error } = await duli
      .from("project_documents")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", outraPastaId)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("pastas irmãs trocam de lugar pela função de troca", async () => {
    const { data: raizes } = await parceiro
      .from("project_documents")
      .select("id, position")
      .eq("project_id", processoId)
      .is("parent_id", null)
      .order("position");
    const [a, b] = raizes!;
    const { error } = await parceiro.rpc("swap_positions", {
      p_tabela: "project_documents",
      p_a: a.id,
      p_b: b.id,
    });
    expect(error).toBeNull();
  });
});
