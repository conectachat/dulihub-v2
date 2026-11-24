// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { entrarComo, type Cliente } from "./clientes";

/**
 * O cliente de parceiro fica fora do funil e do link da ficha (0071; PAR-7,
 * PAR-8). Ele não passa pelo CRM: os processos nascem por "+ Novo processo".
 *
 * As guardas valem no `insert` e no `update of person_id`, e ficam caladas
 * para quem não enxerga a pessoa — a recusa aí é da RLS ou da chave, e a
 * frase não conta a um estranho que o id é de cliente de parceiro.
 *
 * Contas como em `cliente-de-parceiro.test.ts`: a `teste-executora` faz o
 * papel da Duli; a `teste-parceiro` é a estranha. Tudo é apagado no fim.
 */

const s = crypto.randomUUID().replace(/\D/g, "").slice(0, 8).padEnd(8, "0");
const letras = s.replace(/\d/g, (d) => "abcdefghij"[Number(d)]);

const FUNIL = "Cliente de parceiro não entra no funil: use + Novo processo no perfil.";
const FICHA = "Cliente de parceiro não recebe o link da ficha.";

function daquiA(dias: number) {
  return new Date(Date.now() + dias * 86_400_000).toISOString();
}

describe("cliente de parceiro fora do funil e do link da ficha (0071)", () => {
  let executora: Cliente;
  let parceiro: Cliente;
  let executoraId: string;
  let org: string;
  let funil: string;
  let etapa: string;
  let visto: string;
  let deParceiro: string;
  let comum: string;
  const pessoas: string[] = [];

  beforeAll(async () => {
    executora = await entrarComo("executora");
    parceiro = await entrarComo("parceiro");
    executoraId = (await executora.auth.getUser()).data.user!.id;

    const { data: orgs } = await executora
      .from("organizations")
      .select("id, slug")
      .in("slug", ["executora-teste", "parceiro-teste"]);
    org = orgs!.find((o) => o.slug === "executora-teste")!.id;
    const orgParceiro = orgs!.find((o) => o.slug === "parceiro-teste")!.id;

    // A executora é membro de duas organizações: o funil se filtra pela dela.
    const { data: etapas } = await executora
      .from("pipeline_stages")
      .select("id, pipeline_id")
      .eq("organization_id", org)
      .eq("name", "Novo Lead")
      .single();
    funil = etapas!.pipeline_id;
    etapa = etapas!.id;

    const tipo = await executora
      .from("visa_types")
      .insert({ organization_id: org, name: `Visto do parceiro ${letras}` })
      .select("id")
      .single();
    if (tipo.error) throw new Error(`Visto não criado: ${tipo.error.message}`);
    visto = tipo.data.id;

    const criado = await executora.rpc("criar_cliente", {
      p_organizacao: org,
      p_parceiro: orgParceiro,
      p_novo_contato: { full_name: `De parceiro ${letras}` },
    });
    if (criado.error) throw new Error(`Cliente de parceiro não criado: ${criado.error.message}`);
    deParceiro = (criado.data as { pessoa: string }).pessoa;
    pessoas.push(deParceiro);

    const outro = await executora
      .from("people")
      .insert({
        organization_id: org,
        full_name: `Comum ${letras}`,
        email: `comum.${letras}@exemplo.com`,
        phone_country_code: "+55",
        phone: `119${s}`,
      })
      .select("id")
      .single();
    if (outro.error) throw new Error(`Contato comum não criado: ${outro.error.message}`);
    comum = outro.data.id;
    pessoas.push(comum);
  }, 60_000);

  afterAll(async () => {
    if (pessoas.length) await executora.from("people").delete().in("id", pessoas);
    if (visto) await executora.from("visa_types").delete().eq("id", visto);
  });

  describe("funil", () => {
    it("criar_oportunidade com o cliente de parceiro é recusada", async () => {
      const { error } = await executora.rpc("criar_oportunidade", {
        p_etapa: etapa,
        p_titulo: `Negócio ${letras}`,
        p_confirmar_contato_parecido: false,
        p_confirmar_outra_oportunidade: true,
        p_contato: deParceiro,
      });
      expect(error?.message).toBe(FUNIL);
    });

    it("insert direto em opportunities é recusado", async () => {
      const { error } = await executora.from("opportunities").insert({
        organization_id: org,
        person_id: deParceiro,
        pipeline_id: funil,
        stage_id: etapa,
        title: `Direto ${letras}`,
      });
      expect(error?.message).toBe(FUNIL);
    });

    it("levar um negócio aberto para ele é recusado", async () => {
      const { data: negocio, error } = await executora
        .from("opportunities")
        .insert({
          organization_id: org,
          person_id: comum,
          pipeline_id: funil,
          stage_id: etapa,
          title: `Do comum ${letras}`,
        })
        .select("id")
        .single();
      expect(error).toBeNull();

      const troca = await executora
        .from("opportunities")
        .update({ person_id: deParceiro })
        .eq("id", negocio!.id);
      expect(troca.error?.message).toBe(FUNIL);
    });

    it("para quem não enxerga a pessoa, a guarda não fala", async () => {
      const { error } = await parceiro.from("opportunities").insert({
        organization_id: org,
        person_id: deParceiro,
        pipeline_id: funil,
        stage_id: etapa,
        title: `Estranho ${letras}`,
      });
      expect(error).not.toBeNull();
      expect(error?.message).not.toBe(FUNIL);
    });
  });

  describe("link da ficha", () => {
    it("gerar link para ele é recusado", async () => {
      const { error } = await executora.from("registration_forms").insert({
        organization_id: org,
        person_id: deParceiro,
        token: `parceiro-${crypto.randomUUID()}`,
        expires_at: daquiA(15),
        created_by: executoraId,
      });
      expect(error?.message).toBe(FICHA);
    });

    it("levar um link aberto de outra pessoa para ele é recusado", async () => {
      const { data: link, error } = await executora
        .from("registration_forms")
        .insert({
          organization_id: org,
          person_id: comum,
          token: `comum-${crypto.randomUUID()}`,
          expires_at: daquiA(15),
          created_by: executoraId,
        })
        .select("id")
        .single();
      expect(error).toBeNull();

      const troca = await executora
        .from("registration_forms")
        .update({ person_id: deParceiro })
        .eq("id", link!.id);
      expect(troca.error?.message).toBe(FICHA);
    });

    it("para quem não enxerga a pessoa, a guarda não fala", async () => {
      const { error } = await parceiro.from("registration_forms").insert({
        organization_id: org,
        person_id: deParceiro,
        token: `estranho-${crypto.randomUUID()}`,
        expires_at: daquiA(15),
      });
      expect(error).not.toBeNull();
      expect(error?.message).not.toBe(FICHA);
    });
  });

  it("+ Novo processo funciona", async () => {
    const { error } = await executora.rpc("criar_processo", {
      p_person: deParceiro,
      p_visa_type: visto,
      p_title: `Processo ${letras}`,
    });
    expect(error).toBeNull();
  });

  it("o contato comum continua entrando no funil", async () => {
    const { data, error } = await executora.rpc("criar_oportunidade", {
      p_etapa: etapa,
      p_titulo: `Segundo do comum ${letras}`,
      p_confirmar_contato_parecido: false,
      p_confirmar_outra_oportunidade: true,
      p_contato: comum,
    });
    expect(error).toBeNull();
    expect((data as { situacao: string }).situacao).toBe("criada");
  });
});
