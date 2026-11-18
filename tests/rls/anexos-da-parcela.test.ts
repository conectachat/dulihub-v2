// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { entrarComo, fixture, type Cliente } from "./clientes";

/**
 * Anexos da parcela (0048; CLI-6): boleto, nota fiscal, comprovante.
 *
 * O arquivo vai para o depósito `financeiro`, na pasta
 * `{org}/{pessoa}/{cobrança}/{parcela}/{arquivo}/{nome}` — conferida pelo
 * banco contra a parcela de verdade —, e a linha de `installment_files` o
 * registra.
 *
 * Nenhum arquivo pode ficar órfão no depósito: apagar direto uma parcela ou
 * uma cobrança que tem anexo é recusado, também na organização de teste. A
 * cascata vinda da pessoa (só possível na organização de teste) passa.
 *
 * Grava só na organização de teste, numa pessoa descartável; o objeto do
 * depósito e a pessoa são apagados no fim.
 */

const s = crypto.randomUUID().replace(/\D/g, "").slice(0, 8).padEnd(8, "0");
const pdf = new Blob(["%PDF-1.4 boleto"], { type: "application/pdf" });
const FRASE = "Remova os anexos antes.";

describe("anexos da parcela (0048)", () => {
  let parceiro: Cliente;
  let duli: Cliente;
  let org: string;
  let pessoa = "";
  let cobranca = "";
  let parcela1 = "";
  let parcela2 = "";
  let anexo = "";
  let caminho = "";

  beforeAll(async () => {
    [parceiro, duli] = await Promise.all([entrarComo("parceiro"), entrarComo("colaborador")]);
    org = (await fixture(parceiro)).organization_id;

    const criada = await parceiro
      .from("people")
      .insert({
        organization_id: org,
        full_name: `Anexos ${s}`,
        email: `anexos.${s}@teste.dulihub`,
        phone_country_code: "+55",
        phone: `31${s}0`,
        lifecycle_stage: "client",
      })
      .select("id")
      .single();
    if (criada.error) throw new Error(`Pessoa descartável não criada: ${criada.error.message}`);
    pessoa = criada.data.id;

    const c = await parceiro
      .from("receivables")
      .insert({ organization_id: org, person_id: pessoa, title: `Cobrança ${s}`, amount: 200 })
      .select("id")
      .single();
    if (c.error) throw new Error(`Cobrança não criada: ${c.error.message}`);
    cobranca = c.data.id;

    const p = await parceiro
      .from("installments")
      .insert([
        { organization_id: org, receivable_id: cobranca, number: 1, amount: 100, due_on: "2026-12-01" },
        { organization_id: org, receivable_id: cobranca, number: 2, amount: 100, due_on: "2027-01-01" },
      ])
      .select("id, number");
    if (p.error) throw new Error(`Parcelas não criadas: ${p.error.message}`);
    parcela1 = p.data.find((x) => x.number === 1)!.id;
    parcela2 = p.data.find((x) => x.number === 2)!.id;

    anexo = crypto.randomUUID();
    caminho = `${org}/${pessoa}/${cobranca}/${parcela2}/${anexo}/boleto.pdf`;
    const subiu = await parceiro.storage.from("financeiro").upload(caminho, pdf);
    if (subiu.error) throw new Error(`Envio ao depósito falhou: ${subiu.error.message}`);
  }, 60_000);

  afterAll(async () => {
    if (caminho) await parceiro.storage.from("financeiro").remove([caminho]);
    if (pessoa) await parceiro.from("people").delete().eq("id", pessoa);
  });

  it("o anexo da parcela 2 aparece só nela, e abre por URL assinada", async () => {
    const { error } = await parceiro.from("installment_files").insert({
      id: anexo,
      organization_id: org,
      installment_id: parcela2,
      kind: "boleto",
      filename: "boleto.pdf",
      storage_path: caminho,
      mime_type: "application/pdf",
      size_bytes: pdf.size,
    });
    expect(error).toBeNull();

    const [na1, na2] = await Promise.all([
      parceiro.from("installment_files").select("id").eq("installment_id", parcela1),
      parceiro.from("installment_files").select("id, kind").eq("installment_id", parcela2),
    ]);
    expect(na1.data).toEqual([]);
    expect(na2.data).toEqual([{ id: anexo, kind: "boleto" }]);

    const assinada = await parceiro.storage.from("financeiro").createSignedUrl(caminho, 60);
    expect(assinada.error).toBeNull();
    const resposta = await fetch(assinada.data!.signedUrl);
    expect(resposta.status).toBe(200);
  });

  it("caminho que não é o da parcela é recusado", async () => {
    const id = crypto.randomUUID();
    const casos = [
      // Parcela 1 no caminho, parcela 2 na linha.
      `${org}/${pessoa}/${cobranca}/${parcela1}/${id}/x.pdf`,
      // Outra pessoa.
      `${org}/${crypto.randomUUID()}/${cobranca}/${parcela2}/${id}/x.pdf`,
      // Outra organização na frente.
      `${crypto.randomUUID()}/${pessoa}/${cobranca}/${parcela2}/${id}/x.pdf`,
      // Pasta a mais, e nome vazio.
      `${org}/${pessoa}/${cobranca}/${parcela2}/${id}/a/x.pdf`,
      `${org}/${pessoa}/${cobranca}/${parcela2}/${id}/`,
    ];

    for (const errado of casos) {
      const { error } = await parceiro.from("installment_files").insert({
        id,
        organization_id: org,
        installment_id: parcela2,
        kind: "outro",
        filename: "x.pdf",
        storage_path: errado,
      });
      expect(error?.code, errado).toBe("23514");
    }
  });

  it("tipo fora da lista é recusado", async () => {
    const id = crypto.randomUUID();
    const { error } = await parceiro.from("installment_files").insert({
      id,
      organization_id: org,
      installment_id: parcela2,
      kind: "xyz",
      filename: "x.pdf",
      storage_path: `${org}/${pessoa}/${cobranca}/${parcela2}/${id}/x.pdf`,
    });

    expect(error?.code).toBe("23514");
  });

  it("outra organização não lê o anexo nem o arquivo", async () => {
    const [linha, objeto] = await Promise.all([
      duli.from("installment_files").select("id").eq("id", anexo),
      duli.storage.from("financeiro").download(caminho),
    ]);

    expect(linha.data).toEqual([]);
    expect(objeto.data).toBeNull();
  });

  it("apagar direto a parcela com anexo é recusado", async () => {
    const { error } = await parceiro.from("installments").delete().eq("id", parcela2);

    expect(error?.code).toBe("P0001");
    expect(error?.message).toBe(FRASE);
  });

  it("apagar direto a cobrança com anexo é recusado", async () => {
    const { error } = await parceiro.from("receivables").delete().eq("id", cobranca);

    expect(error?.code).toBe("P0001");
    expect(error?.message).toBe(FRASE);
  });

  it("parcela sem anexo se apaga", async () => {
    const { data, error } = await parceiro
      .from("installments")
      .delete()
      .eq("id", parcela1)
      .select("id");

    expect(error).toBeNull();
    expect(data).toEqual([{ id: parcela1 }]);
  });

  it("apagar a pessoa leva cobrança, parcelas e anexos", async () => {
    const { error } = await parceiro.from("people").delete().eq("id", pessoa);
    expect(error).toBeNull();

    const [anexos, cobrancas] = await Promise.all([
      parceiro.from("installment_files").select("id").eq("id", anexo),
      parceiro.from("receivables").select("id").eq("id", cobranca),
    ]);
    expect(anexos.data).toEqual([]);
    expect(cobrancas.data).toEqual([]);
    pessoa = "";
  });
});
