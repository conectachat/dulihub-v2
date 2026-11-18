// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CASOS_DE_CONTATO } from "@/lib/contato.casos";

import { entrarComo, fixture, type Cliente } from "./clientes";

/**
 * Nova oportunidade, com contato existente ou novo, numa gravação só (0041;
 * CRM-11, CRM-12).
 *
 * `criar_oportunidade` confere tudo antes de gravar qualquer coisa: um
 * contato só, a etapa (visível e aberta), o título, o contato (existente fora
 * da lixeira, ou novo com nome, e-mail, DDI e telefone válidos), e então pede
 * confirmação quando há contato parecido ou oportunidade anterior do mesmo
 * contato. Nada fica gravado pela metade: é uma transação.
 *
 * Grava só na organização de teste, com dado aleatório por rodada, e apaga o
 * que criou.
 */

const novoSufixo = () => crypto.randomUUID().replace(/\D/g, "").slice(0, 8).padEnd(8, "0");

const FRASE_DA_ETAPA_TERMINAL =
  "Negócio novo começa numa etapa aberta. Para ganhar ou perder, mova o cartão.";

type Resposta = {
  situacao: "criada" | "precisa_confirmar";
  negocio?: string;
  pessoa?: string;
  parecidos?: { id: string }[];
  oportunidades?: { id: string; titulo: string; status: string; criada_em: string }[];
};

describe("criar oportunidade com contato novo ou existente (0041)", () => {
  let parceiro: Cliente;
  let duli: Cliente;
  let usuario: string;
  let org: string;
  let aberta: string;
  let ganho: string;

  const s = novoSufixo();
  const telExistente = `31${s}`;
  const ids = { existente: "", lixeira: "", cliente: "" };
  const criadas = new Set<string>();

  async function criar(args: {
    contato?: string;
    novo?: Record<string, string>;
    etapa?: string;
    titulo?: string;
    confirmarParecido?: boolean;
    confirmarOutra?: boolean;
    quem?: Cliente;
    valor?: number;
    moeda?: string;
  }) {
    const { data, error } = await (args.quem ?? parceiro).rpc("criar_oportunidade", {
      p_etapa: args.etapa ?? aberta,
      p_titulo: args.titulo ?? `Negócio ${s}`,
      p_confirmar_contato_parecido: args.confirmarParecido ?? false,
      p_confirmar_outra_oportunidade: args.confirmarOutra ?? false,
      ...(args.contato ? { p_contato: args.contato } : {}),
      ...(args.novo ? { p_novo_contato: args.novo } : {}),
      ...(args.valor !== undefined ? { p_valor: args.valor } : {}),
      ...(args.moeda ? { p_moeda: args.moeda } : {}),
    });
    const resposta = (data ?? null) as Resposta | null;
    if (resposta?.situacao === "criada" && resposta.pessoa) criadas.add(resposta.pessoa);
    return { resposta, error };
  }

  async function pessoasComONome(nome: string) {
    const { data } = await parceiro.from("people").select("id").eq("full_name", nome);
    return data ?? [];
  }

  beforeAll(async () => {
    parceiro = await entrarComo("parceiro");
    duli = await entrarComo("colaborador");
    usuario = (await parceiro.auth.getUser()).data.user!.id;
    org = (await fixture(parceiro)).organization_id;

    const { data: funil, error: erroFunil } = await parceiro
      .from("pipelines")
      .select("id")
      .eq("organization_id", org)
      .eq("is_default", true)
      .single();
    if (erroFunil) throw new Error(`Funil ilegível: ${erroFunil.message}`);

    const { data: etapas, error: erroEtapas } = await parceiro
      .from("pipeline_stages")
      .select("id, is_won, is_lost, position")
      .eq("pipeline_id", funil.id)
      .order("position");
    if (erroEtapas) throw new Error(`Etapas ilegíveis: ${erroEtapas.message}`);
    aberta = etapas.find((e) => !e.is_won && !e.is_lost)!.id;
    ganho = etapas.find((e) => e.is_won)!.id;

    // Em lote, o PostgREST manda nulo na coluna que falta em alguma linha:
    // `lifecycle_stage` e `deleted_at` vão em todas.
    const { data, error } = await parceiro
      .from("people")
      .insert([
        {
          organization_id: org,
          full_name: `Existente ${s}`,
          email: `existente.${s}@teste.dulihub`,
          phone_country_code: "+55",
          phone: telExistente,
          lifecycle_stage: "contact",
          deleted_at: null,
        },
        {
          organization_id: org,
          full_name: `Lixeira ${s}`,
          email: `lixeira.${s}@teste.dulihub`,
          phone_country_code: "+55",
          phone: `32${s}`,
          lifecycle_stage: "contact",
          deleted_at: new Date().toISOString(),
        },
        {
          organization_id: org,
          full_name: `Cliente ${s}`,
          email: `cliente.${s}@teste.dulihub`,
          phone_country_code: "+55",
          phone: `33${s}`,
          lifecycle_stage: "client",
          deleted_at: null,
        },
      ])
      .select("id, full_name");
    if (error) throw new Error(`Contatos de apoio não criados: ${error.message}`);

    const id = (prefixo: string) => data.find((p) => p.full_name.startsWith(prefixo))!.id;
    ids.existente = id("Existente ");
    ids.lixeira = id("Lixeira ");
    ids.cliente = id("Cliente ");
  }, 60_000);

  afterAll(async () => {
    const pessoas = [...Object.values(ids).filter(Boolean), ...criadas];
    if (pessoas.length === 0) return;
    await parceiro.from("opportunities").delete().in("person_id", pessoas);
    await parceiro.from("people").delete().in("id", pessoas);
  });

  it("contato novo e negócio nascem juntos", async () => {
    const nome = `Novo ${s}`;
    const { resposta, error } = await criar({
      novo: {
        full_name: nome,
        email: `novo.${s}@teste.dulihub`,
        phone_country_code: "55",
        phone: `34${s}`,
      },
      valor: 1500,
      moeda: "USD",
    });

    expect(error).toBeNull();
    expect(resposta?.situacao).toBe("criada");

    const { data: pessoa } = await parceiro
      .from("people")
      .select("organization_id, lifecycle_stage, phone_country_code, created_by")
      .eq("id", resposta!.pessoa!)
      .single();
    expect(pessoa).toEqual({
      organization_id: org,
      lifecycle_stage: "opportunity",
      phone_country_code: "+55",
      created_by: usuario,
    });

    const { data: negocio } = await parceiro
      .from("opportunities")
      .select("person_id, owner_id, status, value, currency, stage_id")
      .eq("id", resposta!.negocio!)
      .single();
    expect(negocio).toEqual({
      person_id: resposta!.pessoa,
      owner_id: usuario,
      status: "open",
      value: 1500,
      currency: "USD",
      stage_id: aberta,
    });
  });

  it("contato parecido pede confirmação e não grava nada", async () => {
    const nome = `Parecido ${s}`;
    const { resposta, error } = await criar({
      novo: {
        full_name: nome,
        email: `parecido.${s}@teste.dulihub`,
        phone_country_code: "+55",
        phone: `55${telExistente}`,
      },
    });

    expect(error).toBeNull();
    expect(resposta?.situacao).toBe("precisa_confirmar");
    expect(resposta?.parecidos?.map((p) => p.id)).toContain(ids.existente);
    expect(await pessoasComONome(nome)).toHaveLength(0);
  });

  it("confirmado, cria o segundo contato com o mesmo telefone", async () => {
    const { resposta, error } = await criar({
      novo: {
        full_name: `Segundo ${s}`,
        email: `segundo.${s}@teste.dulihub`,
        phone_country_code: "+55",
        phone: telExistente,
      },
      confirmarParecido: true,
    });

    expect(error).toBeNull();
    expect(resposta?.situacao).toBe("criada");
    expect(resposta?.pessoa).not.toBe(ids.existente);
  });

  it("etapa terminal não cria nada", async () => {
    const nome = `Terminal ${s}`;
    const { resposta, error } = await criar({
      etapa: ganho,
      novo: {
        full_name: nome,
        email: `terminal.${s}@teste.dulihub`,
        phone_country_code: "+55",
        phone: `35${s}`,
      },
    });

    expect(resposta).toBeNull();
    expect(error?.message).toBe(FRASE_DA_ETAPA_TERMINAL);
    expect(await pessoasComONome(nome)).toHaveLength(0);
  });

  it("oportunidade existente pede confirmação; confirmada, cria a segunda", async () => {
    const primeira = await criar({ contato: ids.existente, titulo: `Primeira ${s}` });
    expect(primeira.error).toBeNull();
    expect(primeira.resposta?.situacao).toBe("criada");

    const segunda = await criar({ contato: ids.existente, titulo: `Segunda ${s}` });
    expect(segunda.error).toBeNull();
    expect(segunda.resposta?.situacao).toBe("precisa_confirmar");
    const anterior = segunda.resposta?.oportunidades?.find((o) => o.id === primeira.resposta?.negocio);
    expect(anterior).toMatchObject({ titulo: `Primeira ${s}`, status: "open" });
    expect(Number.isNaN(Date.parse(anterior!.criada_em))).toBe(false);

    const confirmada = await criar({
      contato: ids.existente,
      titulo: `Segunda ${s}`,
      confirmarOutra: true,
    });
    expect(confirmada.error).toBeNull();
    expect(confirmada.resposta?.situacao).toBe("criada");

    const { data } = await parceiro
      .from("opportunities")
      .select("id")
      .eq("person_id", ids.existente);
    expect(data).toHaveLength(2);
  });

  it("contato na lixeira é recusado", async () => {
    const { resposta, error } = await criar({ contato: ids.lixeira, confirmarOutra: true });

    expect(resposta).toBeNull();
    expect(error?.message).toBe("Este contato está na lixeira. Restaure antes.");
  });

  it("um contato só: os dois juntos, ou nenhum, são recusados", async () => {
    const nenhum = await criar({});
    expect(nenhum.error?.message).toBe("Escolha um contato ou preencha um novo");

    const dois = await criar({
      contato: ids.existente,
      novo: { full_name: "X", email: "x@teste.dulihub", phone_country_code: "+55", phone: "3199999999" },
    });
    expect(dois.error?.message).toBe("Escolha um contato ou preencha um novo");
  });

  it("quem não é da organização da etapa é recusado", async () => {
    const { resposta, error } = await criar({
      quem: duli,
      novo: {
        full_name: `Intruso ${s}`,
        email: `intruso.${s}@teste.dulihub`,
        phone_country_code: "+55",
        phone: `36${s}`,
      },
    });

    expect(resposta).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("cliente continua cliente", async () => {
    const { resposta, error } = await criar({ contato: ids.cliente, confirmarOutra: true });

    expect(error).toBeNull();
    expect(resposta?.situacao).toBe("criada");
    const { data } = await parceiro
      .from("people")
      .select("lifecycle_stage")
      .eq("id", ids.cliente)
      .single();
    expect(data?.lifecycle_stage).toBe("client");
  });

  it.each(CASOS_DE_CONTATO.map((c, i) => ({ ...c, i })))("paridade: $nome", async (c) => {
    const { resposta, error } = await criar({
      novo: {
        full_name: `Paridade ${c.i} ${s}`,
        email: c.contato.email ?? "",
        phone_country_code: c.contato.ddi ?? "",
        phone: c.contato.telefone ?? "",
      },
      confirmarParecido: true,
      confirmarOutra: true,
    });

    if (c.erro) {
      expect(resposta).toBeNull();
      expect(error?.message).toBe(c.erro);
    } else {
      expect(error).toBeNull();
      expect(resposta?.situacao).toBe("criada");
    }
  });
});
