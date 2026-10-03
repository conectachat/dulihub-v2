// @vitest-environment node

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

import { obrigatorio } from "../contas";
import { entrarComo, type Cliente } from "./clientes";

/**
 * Ficha de cadastro por link: a primeira porta do app para quem não tem login.
 *
 * Até a 0035 nada no banco era alcançável sem sessão — toda policy é
 * `to authenticated` e nenhuma função era chamável por `anon`. A ficha abre
 * duas funções, e esta suíte existe para provar que a porta tem a largura de
 * **uma pessoa por token**, e nada além:
 *
 * - sem token, o anônimo não lê tabela nenhuma;
 * - com token, altera só os campos da ficha, só daquela pessoa, uma vez só;
 * - o que a página pública recebe de volta não inclui documento nem endereço.
 *
 * Roda contra o banco de verdade, pelo PostgREST, como o app.
 */

const anonimo = () =>
  createClient<Database>(
    obrigatorio("NEXT_PUBLIC_SUPABASE_URL"),
    obrigatorio("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

const novoToken = () =>
  `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");

const daquiA = (dias: number) =>
  new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();

/** A ficha inteira, como o formulário público a envia. */
const fichaCompleta = (nome: string) => ({
  full_name: nome,
  birth_date: "1990-05-20",
  tax_id: "529.982.247-25",
  national_id: "1234567",
  national_id_issuer: "SSP/MA",
  gender: "feminino",
  marital_status: "casado",
  birthplace: "São Luís",
  nationality: "Brasileira",
  email: "lead-da-ficha@example.com",
  phone_country_code: "+55",
  phone: "98999990000",
  address_street: "Rua da Filosofia",
  address_number: "10",
  address_complement: "",
  address_district: "Cohafuma",
  address_city: "São Luís",
  address_state: "MA",
  address_country: "Brasil",
  address_postal_code: "65000-000",
  dependents: [
    {
      full_name: "Filho de Teste",
      relationship: "child",
      birth_date: "2015-01-10",
      birth_country: "Brasil",
    },
  ],
});

const ACEITE = "Declaro que as informações acima são verdadeiras.";

describe("ficha de cadastro por link", () => {
  let parceiro: Cliente;
  let duli: Cliente;
  let anon: Cliente;
  let orgParceiro: string;
  let pessoaId: string;
  let outraId: string;
  const NOME = `Lead da ficha ${crypto.randomUUID().slice(0, 8)}`;

  /** Um link em aberto para a pessoa, criado pela equipe do parceiro. */
  async function criarLink(
    pessoa: string,
    campos: { expires_at?: string; cancelled_at?: string } = {},
  ) {
    const token = novoToken();
    const { data, error } = await parceiro
      .from("registration_forms")
      .insert({
        organization_id: orgParceiro,
        person_id: pessoa,
        token,
        expires_at: campos.expires_at ?? daquiA(15),
        cancelled_at: campos.cancelled_at ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Link não criado: ${error.message}`);
    return { id: data.id, token };
  }

  /** Fecha o link em aberto, para o teste seguinte poder abrir outro. */
  const cancelar = (id: string) =>
    parceiro
      .from("registration_forms")
      .update({ cancelled_at: new Date().toISOString() })
      .eq("id", id);

  beforeAll(async () => {
    parceiro = await entrarComo("parceiro");
    duli = await entrarComo("colaborador");
    anon = anonimo();

    const { data: membro, error: erroMembro } = await parceiro
      .from("organization_members")
      .select("organization_id")
      .limit(1)
      .single();
    if (erroMembro) throw new Error(`Organização ilegível: ${erroMembro.message}`);
    orgParceiro = membro.organization_id;

    const { data, error } = await parceiro
      .from("people")
      .insert([
        { organization_id: orgParceiro, full_name: NOME, email: "antes@example.com" },
        { organization_id: orgParceiro, full_name: `${NOME} (vizinha)` },
      ])
      .select("id, full_name");
    if (error) throw new Error(`Pessoas da suíte não criadas: ${error.message}`);
    pessoaId = data.find((p) => p.full_name === NOME)!.id;
    outraId = data.find((p) => p.full_name !== NOME)!.id;
  }, 60_000);

  afterAll(async () => {
    // A chave em cascata leva links e dependentes junto.
    if (pessoaId) await parceiro.from("people").delete().in("id", [pessoaId, outraId]);
  });

  // ------------------------------------------------------------ sem token

  it("sem token, o anônimo não lê pessoa, link nem dependente", async () => {
    const link = await criarLink(pessoaId);

    const [pessoas, links, dependentes] = await Promise.all([
      anon.from("people").select("id").eq("id", pessoaId),
      anon.from("registration_forms").select("id").eq("id", link.id),
      anon.from("person_dependents").select("id").eq("person_id", pessoaId),
    ]);

    expect(pessoas.data ?? []).toEqual([]);
    expect(links.data ?? []).toEqual([]);
    expect(dependentes.data ?? []).toEqual([]);

    await cancelar(link.id);
  });

  it("token que não existe não abre nada", async () => {
    const { data, error } = await anon.rpc("abrir_ficha_de_cadastro", {
      p_token: novoToken(),
    });

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("token que não existe não grava nada", async () => {
    const { error } = await anon.rpc("enviar_ficha_de_cadastro", {
      p_token: novoToken(),
      p_dados: fichaCompleta("Invasor"),
      p_consentimento: ACEITE,
    });

    expect(error).not.toBeNull();
  });

  it("o anônimo não usa a porta da equipe", async () => {
    const { error } = await anon.rpc("salvar_cadastro", {
      p_person: pessoaId,
      p_dados: fichaCompleta("Invasor"),
    });

    expect(error).not.toBeNull();

    const { data } = await parceiro
      .from("people")
      .select("full_name")
      .eq("id", pessoaId)
      .single();
    expect(data?.full_name).toBe(NOME);
  });

  // ------------------------------------------------------------ com token

  it("abrir o link devolve o nome e o contato — nunca documento ou endereço", async () => {
    const link = await criarLink(pessoaId);

    const { data, error } = await anon.rpc("abrir_ficha_de_cadastro", {
      p_token: link.token,
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].situacao).toBe("aberta");
    expect(data![0].nome).toBe(NOME);
    expect(data![0].email).toBe("antes@example.com");
    // A lista fechada do que a página pública pode saber.
    expect(Object.keys(data![0]).sort()).toEqual(
      ["ddi", "email", "nome", "organizacao", "situacao", "telefone"].sort(),
    );

    await cancelar(link.id);
  });

  it("ficha incompleta é recusada, e a pessoa fica como estava", async () => {
    const link = await criarLink(pessoaId);
    const semCpf: Partial<ReturnType<typeof fichaCompleta>> = fichaCompleta(NOME);
    delete semCpf.tax_id;

    const { error } = await anon.rpc("enviar_ficha_de_cadastro", {
      p_token: link.token,
      p_dados: semCpf,
      p_consentimento: ACEITE,
    });
    expect(error).not.toBeNull();

    const semAceite = await anon.rpc("enviar_ficha_de_cadastro", {
      p_token: link.token,
      p_dados: fichaCompleta(NOME),
      p_consentimento: " ",
    });
    expect(semAceite.error).not.toBeNull();

    const { data } = await parceiro
      .from("people")
      .select("tax_id, address_city")
      .eq("id", pessoaId)
      .single();
    expect(data).toEqual({ tax_id: null, address_city: null });

    await cancelar(link.id);
  });

  it("ficha grande demais é recusada", async () => {
    const link = await criarLink(pessoaId);

    const gigante = await anon.rpc("enviar_ficha_de_cadastro", {
      p_token: link.token,
      p_dados: { ...fichaCompleta(NOME), address_street: "x".repeat(5000) },
      p_consentimento: ACEITE,
    });
    expect(gigante.error).not.toBeNull();

    const dependente = fichaCompleta(NOME).dependents[0];
    const muitos = await anon.rpc("enviar_ficha_de_cadastro", {
      p_token: link.token,
      p_dados: {
        ...fichaCompleta(NOME),
        dependents: Array.from({ length: 11 }, () => dependente),
      },
      p_consentimento: ACEITE,
    });
    expect(muitos.error).not.toBeNull();

    const { data } = await parceiro
      .from("person_dependents")
      .select("id")
      .eq("person_id", pessoaId);
    expect(data).toEqual([]);

    await cancelar(link.id);
  });

  it("link vencido e link cancelado não gravam", async () => {
    const vencido = await criarLink(pessoaId, { expires_at: daquiA(-1) });
    const tentativa = await anon.rpc("enviar_ficha_de_cadastro", {
      p_token: vencido.token,
      p_dados: fichaCompleta(NOME),
      p_consentimento: ACEITE,
    });
    expect(tentativa.error).not.toBeNull();

    const aberto = await anon.rpc("abrir_ficha_de_cadastro", { p_token: vencido.token });
    expect(aberto.data?.[0]?.situacao).toBe("expirada");
    // Link morto não devolve nem o nome.
    expect(aberto.data?.[0]?.nome).toBeNull();
    await cancelar(vencido.id);

    const cancelado = await criarLink(pessoaId, {
      cancelled_at: new Date().toISOString(),
    });
    const outra = await anon.rpc("enviar_ficha_de_cadastro", {
      p_token: cancelado.token,
      p_dados: fichaCompleta(NOME),
      p_consentimento: ACEITE,
    });
    expect(outra.error).not.toBeNull();

    const { data } = await parceiro
      .from("people")
      .select("tax_id")
      .eq("id", pessoaId)
      .single();
    expect(data?.tax_id).toBeNull();
  });

  it("só um link em aberto por pessoa", async () => {
    const primeiro = await criarLink(pessoaId);

    const { error } = await parceiro.from("registration_forms").insert({
      organization_id: orgParceiro,
      person_id: pessoaId,
      token: novoToken(),
      expires_at: daquiA(15),
    });
    expect(error?.code).toBe("23505");

    await cancelar(primeiro.id);
  });

  it("a porta do lead é anônima: quem está logado não entra por ela", async () => {
    // Com sessão, o gatilho que congela o CPF na auto-edição do cliente
    // (0013) poderia descartar o documento em silêncio. A porta recusa alto.
    const link = await criarLink(pessoaId);

    const { error } = await parceiro.rpc("enviar_ficha_de_cadastro", {
      p_token: link.token,
      p_dados: fichaCompleta(NOME),
      p_consentimento: ACEITE,
    });
    expect(error).not.toBeNull();

    await cancelar(link.id);
  });

  it("envio certo atualiza só aquela pessoa, só os campos da ficha, uma vez só", async () => {
    const link = await criarLink(pessoaId);
    const NOVO_NOME = `${NOME} Completo`;

    const { error } = await anon.rpc("enviar_ficha_de_cadastro", {
      p_token: link.token,
      p_dados: {
        ...fichaCompleta(NOVO_NOME),
        // Chaves que a ficha não tem: ignoradas, não erro e não gravação.
        organization_id: crypto.randomUUID(),
        lifecycle_stage: "client",
        user_id: crypto.randomUUID(),
        notes: "injetado",
      },
      p_consentimento: ACEITE,
    });
    expect(error).toBeNull();

    const { data: pessoa } = await parceiro
      .from("people")
      .select(
        `full_name, tax_id, national_id, birth_date, gender, marital_status, email,
         address_city, address_postal_code, organization_id, lifecycle_stage,
         user_id, notes`,
      )
      .eq("id", pessoaId)
      .single();

    expect(pessoa).toMatchObject({
      full_name: NOVO_NOME,
      // Guardado só com os dígitos; a máscara é da tela.
      tax_id: "52998224725",
      national_id: "1234567",
      birth_date: "1990-05-20",
      gender: "feminino",
      marital_status: "casado",
      email: "lead-da-ficha@example.com",
      address_city: "São Luís",
      address_postal_code: "65000-000",
      organization_id: orgParceiro,
      lifecycle_stage: "contact",
      user_id: null,
      notes: null,
    });

    const { data: dependentes } = await parceiro
      .from("person_dependents")
      .select("full_name, relationship, birth_date, birth_country, organization_id")
      .eq("person_id", pessoaId);
    expect(dependentes).toEqual([
      {
        full_name: "Filho de Teste",
        relationship: "child",
        birth_date: "2015-01-10",
        birth_country: "Brasil",
        organization_id: orgParceiro,
      },
    ]);

    // A vizinha, da mesma organização, não foi tocada.
    const { data: vizinha } = await parceiro
      .from("people")
      .select("full_name, tax_id")
      .eq("id", outraId)
      .single();
    expect(vizinha).toEqual({ full_name: `${NOME} (vizinha)`, tax_id: null });

    // O link guarda o que foi declarado e o que havia antes.
    const { data: ficha } = await parceiro
      .from("registration_forms")
      .select("submitted_at, answers, previous, consent_text, reviewed_at")
      .eq("id", link.id)
      .single();
    expect(ficha?.submitted_at).not.toBeNull();
    expect(ficha?.reviewed_at).toBeNull();
    expect(ficha?.consent_text).toBe(ACEITE);
    expect(ficha?.answers).toMatchObject({ full_name: NOVO_NOME, tax_id: "52998224725" });
    expect(ficha?.answers).not.toHaveProperty("organization_id");
    expect(ficha?.previous).toMatchObject({ full_name: NOME, email: "antes@example.com" });

    // E o histórico do contato registra a chegada.
    const { data: historico } = await parceiro
      .from("activities")
      .select("type")
      .eq("person_id", pessoaId)
      .eq("type", "registration_submitted");
    expect(historico).toHaveLength(1);

    // Uso único: o mesmo link não grava de novo, e não devolve mais nada.
    const repetido = await anon.rpc("enviar_ficha_de_cadastro", {
      p_token: link.token,
      p_dados: fichaCompleta("Segunda vez"),
      p_consentimento: ACEITE,
    });
    expect(repetido.error).not.toBeNull();

    const aberto = await anon.rpc("abrir_ficha_de_cadastro", { p_token: link.token });
    expect(aberto.data?.[0]).toMatchObject({ situacao: "enviada", nome: null, email: null });

    const { data: depois } = await parceiro
      .from("people")
      .select("full_name")
      .eq("id", pessoaId)
      .single();
    expect(depois?.full_name).toBe(NOVO_NOME);
  }, 60_000);

  // --------------------------------------------------------- entre organizações

  it("a Duli não enxerga o link nem os dependentes do parceiro", async () => {
    const [links, dependentes] = await Promise.all([
      duli.from("registration_forms").select("id").eq("person_id", pessoaId),
      duli.from("person_dependents").select("id").eq("person_id", pessoaId),
    ]);

    expect(links.data).toEqual([]);
    expect(dependentes.data).toEqual([]);
  });

  it("a Duli não gera link para pessoa do parceiro", async () => {
    const { data: daDuli } = await duli
      .from("organization_members")
      .select("organization_id")
      .limit(1)
      .single();

    // Carimbado com a organização do parceiro: a policy recusa.
    const comoParceiro = await duli.from("registration_forms").insert({
      organization_id: orgParceiro,
      person_id: outraId,
      token: novoToken(),
      expires_at: daquiA(15),
    });
    expect(comoParceiro.error).not.toBeNull();

    // Carimbado com a da Duli: a policy aceita, a chave composta recusa.
    const comoDuli = await duli.from("registration_forms").insert({
      organization_id: daDuli!.organization_id,
      person_id: outraId,
      token: novoToken(),
      expires_at: daquiA(15),
    });
    expect(comoDuli.error).not.toBeNull();
  });

  it("a porta da equipe grava ficha parcial da própria organização — e só dela", async () => {
    const parcial = await parceiro.rpc("salvar_cadastro", {
      p_person: outraId,
      p_dados: { full_name: `${NOME} (vizinha)`, address_city: "Imperatriz" },
    });
    expect(parcial.error).toBeNull();

    const alheia = await duli.rpc("salvar_cadastro", {
      p_person: outraId,
      p_dados: { full_name: "Tomada pela Duli" },
    });
    expect(alheia.error).not.toBeNull();

    const { data } = await parceiro
      .from("people")
      .select("full_name, address_city")
      .eq("id", outraId)
      .single();
    expect(data).toEqual({ full_name: `${NOME} (vizinha)`, address_city: "Imperatriz" });
  });
});
