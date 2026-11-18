// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { entrarComo, fixture, type Cliente } from "./clientes";

/**
 * Documentos do cliente (0047; CLI-8): passaporte, identidade, comprovante
 * de residência, contrato — os papéis da pessoa, fora de qualquer processo.
 *
 * O arquivo vai para o depósito `pessoas`, na pasta da organização e da
 * pessoa (`{org}/{pessoa}/{arquivo}/{nome}`), e a linha de `files` registra
 * a categoria. O banco confere o caminho contra a própria linha, e o
 * depósito decide pela primeira pasta: outra organização não lê nem o
 * objeto nem a linha.
 *
 * Grava só na organização de teste, numa pessoa descartável; o objeto e a
 * pessoa são apagados no fim.
 */

const s = crypto.randomUUID().replace(/\D/g, "").slice(0, 8).padEnd(8, "0");
const pdf = new Blob(["%PDF-1.4 documento do cliente"], { type: "application/pdf" });

describe("documentos do cliente (0047)", () => {
  let parceiro: Cliente;
  let duli: Cliente;
  let org: string;
  let pessoa = "";
  const objetos: string[] = [];

  function semCategoria(id: string, caminho: string) {
    return {
      id,
      organization_id: org,
      person_id: pessoa,
      bucket: "pessoas",
      path: caminho,
      filename: "teste.pdf",
      mime_type: "application/pdf",
      size_bytes: pdf.size,
    };
  }

  function linha(id: string, caminho: string, categoria = "passaporte") {
    return { ...semCategoria(id, caminho), category: categoria };
  }

  beforeAll(async () => {
    [parceiro, duli] = await Promise.all([entrarComo("parceiro"), entrarComo("colaborador")]);
    org = (await fixture(parceiro)).organization_id;

    const { data, error } = await parceiro
      .from("people")
      .insert({
        organization_id: org,
        full_name: `Documentos ${s}`,
        email: `documentos.${s}@teste.dulihub`,
        phone_country_code: "+55",
        phone: `31${s}0`,
        lifecycle_stage: "client",
      })
      .select("id")
      .single();
    if (error) throw new Error(`Pessoa descartável não criada: ${error.message}`);
    pessoa = data.id;
  }, 60_000);

  afterAll(async () => {
    if (objetos.length) await parceiro.storage.from("pessoas").remove(objetos);
    if (pessoa) await parceiro.from("people").delete().eq("id", pessoa);
  });

  it("o parceiro envia o arquivo e registra a categoria; outra organização não vê nada", async () => {
    const id = crypto.randomUUID();
    const caminho = `${org}/${pessoa}/${id}/teste.pdf`;

    const subiu = await parceiro.storage.from("pessoas").upload(caminho, pdf);
    expect(subiu.error).toBeNull();
    objetos.push(caminho);

    const { error } = await parceiro.from("files").insert(linha(id, caminho));
    expect(error).toBeNull();

    const { data: lida } = await parceiro.from("files").select("category").eq("id", id).single();
    expect(lida?.category).toBe("passaporte");

    const [objetoDeFora, linhaDeFora] = await Promise.all([
      duli.storage.from("pessoas").download(caminho),
      duli.from("files").select("id").eq("id", id),
    ]);
    expect(objetoDeFora.data).toBeNull();
    expect(linhaDeFora.data).toEqual([]);
  });

  it("a categoria sem padrão vira 'outro'", async () => {
    const id = crypto.randomUUID();

    const { error } = await parceiro
      .from("files")
      .insert(semCategoria(id, `${org}/${pessoa}/${id}/x.pdf`));
    expect(error).toBeNull();

    const { data } = await parceiro.from("files").select("category").eq("id", id).single();
    expect(data?.category).toBe("outro");
  });

  it("caminho com outra organização na frente é recusado", async () => {
    const id = crypto.randomUUID();

    const { error } = await parceiro
      .from("files")
      .insert(linha(id, `${crypto.randomUUID()}/${pessoa}/${id}/teste.pdf`));

    expect(error?.code).toBe("23514");
  });

  it("caminho de outra pessoa, de outro arquivo, ou com pasta a mais, é recusado", async () => {
    const id = crypto.randomUUID();
    const caminhos = [
      `${org}/${crypto.randomUUID()}/${id}/teste.pdf`,
      `${org}/${pessoa}/${crypto.randomUUID()}/teste.pdf`,
      `${org}/${pessoa}/${id}/sub/teste.pdf`,
      `${org}/${pessoa}/${id}/`,
    ];

    for (const caminho of caminhos) {
      const { error } = await parceiro.from("files").insert(linha(id, caminho));
      expect(error?.code, caminho).toBe("23514");
    }
  });

  it("categoria fora da lista é recusada", async () => {
    const id = crypto.randomUUID();

    const { error } = await parceiro
      .from("files")
      .insert(linha(id, `${org}/${pessoa}/${id}/teste.pdf`, "xyz"));

    expect(error?.code).toBe("23514");
  });

  it("só o depósito 'pessoas'", async () => {
    const id = crypto.randomUUID();

    const { error } = await parceiro
      .from("files")
      .insert({ ...linha(id, `${org}/${pessoa}/${id}/teste.pdf`), bucket: "documentos" });

    expect(error?.code).toBe("23514");
  });

  it("o negócio ligado ao arquivo tem de ser da mesma organização", async () => {
    // Um negócio da Duli, que o parceiro nem enxerga: a chave composta recusa.
    // Pela organização, não "o primeiro visível": um contato de parceiro
    // atribuído à Duli traria negócio do parceiro.
    const { data: duliOrg } = await duli
      .from("organizations")
      .select("id")
      .eq("slug", "duli")
      .single();
    const { data: daDuli, error: erroDaDuli } = await duli
      .from("opportunities")
      .select("id")
      .eq("organization_id", duliOrg!.id)
      .limit(1)
      .single();
    if (erroDaDuli) throw new Error(`Nenhum negócio da Duli para o teste: ${erroDaDuli.message}`);
    const id = crypto.randomUUID();

    const { error } = await parceiro
      .from("files")
      .insert({ ...linha(id, `${org}/${pessoa}/${id}/teste.pdf`), opportunity_id: daDuli.id });

    expect(error?.code).toBe("23503");
  });
});
