// @vitest-environment node

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { entrarComo } from "./clientes";

/**
 * O teste que protege o negócio.
 *
 * A separação entre a Duli e cada parceiro não está no código da aplicação:
 * está inteira na RLS. Nenhuma query filtra por organização — todas confiam na
 * policy. Se uma policy afrouxar, nada na tela muda e nada quebra; o parceiro
 * simplesmente passa a ver a carteira da Duli.
 *
 * Por isso este arquivo existe, e por isso ele não pode pular quando falta
 * credencial.
 */

describe("uma organização não alcança dado da outra", () => {
  let parceiro: SupabaseClient;
  let duli: SupabaseClient;

  beforeAll(async () => {
    parceiro = await entrarComo("parceiro");
    duli = await entrarComo("colaborador");
  }, 30_000);

  it("o parceiro enxerga só as pessoas dele", async () => {
    const { data, error } = await parceiro.from("people").select("full_name");

    expect(error).toBeNull();
    expect(data).toEqual([{ full_name: "Cliente de Teste" }]);
  });

  it("a Duli enxerga a carteira dela, e nenhum contato do parceiro", async () => {
    const { data, error } = await duli.from("people").select("full_name");

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(50);
    expect(data!.map((p) => p.full_name)).not.toContain("Cliente de Teste");
  });

  it("o parceiro não enxerga o catálogo de documentos da Duli", async () => {
    const { data, error } = await parceiro.from("document_types").select("name");

    expect(error).toBeNull();
    expect(data).toEqual([{ name: "Pasta do Parceiro" }]);
  });

  it("o parceiro não enxerga os tipos de visto da Duli", async () => {
    const { data, error } = await parceiro.from("visa_types").select("name");

    expect(error).toBeNull();
    expect(data).toEqual([{ name: "Visto do Parceiro" }]);
  });

  it("o parceiro não enxerga as tags da Duli", async () => {
    const { data, error } = await parceiro.from("tags").select("name");

    expect(error).toBeNull();
    expect(data).toEqual([{ name: "Tag do Parceiro" }]);
  });

  it("o parceiro não grava pessoa dentro da Duli", async () => {
    const { data: orgDaDuli } = await duli
      .from("organization_members")
      .select("organization_id")
      .limit(1)
      .maybeSingle();

    const { data, error } = await parceiro
      .from("people")
      .insert({
        organization_id: orgDaDuli!.organization_id,
        full_name: "Invasor",
      })
      .select("id");

    // A `with check` recusa a linha: aqui tem de vir erro, não silêncio.
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("o parceiro não altera contato da Duli — e o zero é visível", async () => {
    // Este é o caso que a Etapa 2 tratou no código: PostgREST aplica a RLS
    // como filtro, então a linha escondida simplesmente não casa. Sem erro,
    // sem linha. É por isso que toda gravação leva `.select("id")`.
    const { data, error } = await parceiro
      .from("people")
      .update({ full_name: "Renomeado por quem não devia" })
      .neq("full_name", "Cliente de Teste")
      .select("id");

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
