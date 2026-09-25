// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { entrarComo, fixture, type Cliente } from "./clientes";

/**
 * A receber: quem enxerga o dinheiro de quem.
 *
 * Cobrança e parcela carregam valor combinado com cliente — é o dado mais
 * sensível que o app guarda depois dos documentos. A separação é inteira do
 * banco: `organization_id` em tudo, chaves compostas, e nenhuma linha
 * conseguindo apontar para a organização errada.
 *
 * O caso que a chave composta existe para barrar não é o parceiro tentando
 * invadir: é a cobrança que nasce carimbada com a organização de quem clicou
 * em vez da do cliente. A linha sai **válida**, e a RLS não recusa nada —
 * quem recusa é a chave.
 */

describe("a receber", () => {
  let parceiro: Cliente;
  let duli: Cliente;
  let pessoaId: string;
  let orgParceiro: string;
  let cobrancaId: string;

  beforeAll(async () => {
    parceiro = await entrarComo("parceiro");
    duli = await entrarComo("colaborador");

    const pessoa = await fixture(parceiro);
    pessoaId = pessoa.id;
    orgParceiro = pessoa.organization_id;

    const { data, error } = await parceiro
      .from("receivables")
      .insert({
        organization_id: orgParceiro,
        person_id: pessoaId,
        title: "Cobrança da suíte",
        amount: 12000,
        currency: "USD",
      })
      .select("id")
      .single();
    if (error) throw new Error(`Cobrança não criada: ${error.message}`);
    cobrancaId = data.id;

    const parcelas = await parceiro.from("installments").insert([
      {
        organization_id: orgParceiro,
        receivable_id: cobrancaId,
        number: 1,
        amount: 6000,
        due_on: "2026-10-10",
        method: "pix",
      },
      {
        organization_id: orgParceiro,
        receivable_id: cobrancaId,
        number: 2,
        amount: 6000,
        due_on: "2026-11-10",
        method: "pix",
      },
    ]);
    if (parcelas.error) throw new Error(`Parcelas não criadas: ${parcelas.error.message}`);
  }, 60_000);

  afterAll(async () => {
    if (cobrancaId) await parceiro.from("receivables").delete().eq("id", cobrancaId);
  });

  it("a Duli não enxerga a cobrança do parceiro", async () => {
    const { data, error } = await duli
      .from("receivables")
      .select("id")
      .eq("id", cobrancaId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("a Duli não enxerga as parcelas do parceiro", async () => {
    const { data } = await duli
      .from("installments")
      .select("id")
      .eq("receivable_id", cobrancaId);

    expect(data).toEqual([]);
  });

  it("a Duli não altera o valor de uma cobrança que não é dela", async () => {
    // Sem erro e sem linha: a policy filtra em vez de recusar, e é por isso
    // que toda gravação conta as linhas (`lib/gravar.ts`).
    const { data, error } = await duli
      .from("receivables")
      .update({ amount: 1 })
      .eq("id", cobrancaId)
      .select("id");

    expect(error).toBeNull();
    expect(data).toEqual([]);

    const depois = await parceiro
      .from("receivables")
      .select("amount")
      .eq("id", cobrancaId)
      .single();
    expect(Number(depois.data?.amount)).toBe(12000);
  });

  it("a Duli não apaga cobrança do parceiro", async () => {
    const { data } = await duli.from("receivables").delete().eq("id", cobrancaId).select("id");
    expect(data).toEqual([]);

    const ainda = await parceiro.from("receivables").select("id").eq("id", cobrancaId);
    expect(ainda.data).toHaveLength(1);
  });

  it("cobrança carimbada com a organização errada é recusada pela chave", async () => {
    // O cliente é do parceiro; a organização diz que é da Duli. A linha é
    // válida para a RLS de quem grava — quem barra é a chave composta.
    const { data: daDuli } = await duli
      .from("organization_members")
      .select("organization_id")
      .limit(1)
      .single();

    const { error } = await duli.from("receivables").insert({
      organization_id: daDuli!.organization_id,
      person_id: pessoaId,
      title: "Carimbo errado",
      amount: 10,
    });

    expect(error).not.toBeNull();
  });

  it("parcela não se pendura em cobrança de outra organização", async () => {
    const { data: daDuli } = await duli
      .from("organization_members")
      .select("organization_id")
      .limit(1)
      .single();

    const { error } = await duli.from("installments").insert({
      organization_id: daDuli!.organization_id,
      receivable_id: cobrancaId,
      number: 9,
      amount: 10,
      due_on: "2026-12-01",
      method: "pix",
    });

    expect(error).not.toBeNull();
  });

  it("duas parcelas com o mesmo número na mesma cobrança são recusadas", async () => {
    const { error } = await parceiro.from("installments").insert({
      organization_id: orgParceiro,
      receivable_id: cobrancaId,
      number: 1,
      amount: 10,
      due_on: "2026-12-01",
      method: "pix",
    });

    expect(error?.code).toBe("23505");
  });

  it("apagar a cobrança leva as parcelas e deixa lápide para as duas", async () => {
    // Sem lápide, a parcela apagada no escritório continuaria na tela de quem
    // está viajando — e cobrança que não existe mais é o pior tipo de engano.
    const { data: nova } = await parceiro
      .from("receivables")
      .insert({
        organization_id: orgParceiro,
        person_id: pessoaId,
        title: "Cobrança efêmera",
        amount: 100,
      })
      .select("id")
      .single();

    const { data: parcela } = await parceiro
      .from("installments")
      .insert({
        organization_id: orgParceiro,
        receivable_id: nova!.id,
        number: 1,
        amount: 100,
        due_on: "2026-12-01",
        method: "pix",
      })
      .select("id")
      .single();

    await parceiro.from("receivables").delete().eq("id", nova!.id);

    const { data: sumiram } = await parceiro
      .from("installments")
      .select("id")
      .eq("id", parcela!.id);
    expect(sumiram).toEqual([]);

    const { data: lapides } = await parceiro
      .from("deleted_rows")
      .select("tabela, id")
      .in("id", [nova!.id, parcela!.id]);

    expect(lapides?.map((l) => l.tabela).sort()).toEqual(["installments", "receivables"]);
  }, 60_000);

  it("o manifesto conta as duas tabelas novas", async () => {
    // Fora do manifesto, a tabela é puxada mas nunca conferida: um furo de
    // marca d'água vira dado errado permanente no aparelho.
    const { data, error } = await parceiro.rpc("sync_manifesto");

    expect(error).toBeNull();
    const tabelas = (data ?? []).map((m) => m.tabela);
    expect(tabelas).toContain("receivables");
    expect(tabelas).toContain("installments");
  });
});
