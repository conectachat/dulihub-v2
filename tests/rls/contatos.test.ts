// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { entrarComo, fixture, type Cliente } from "./clientes";

/**
 * Contato completo e sem duplicata, no banco (0040; CON-8, CON-4).
 *
 * - `contatos_parecidos` acha o mesmo e-mail ou o mesmo telefone mesmo
 *   digitados de outro jeito: espaço, maiúscula, DDI junto do número, contato
 *   antigo gravado sem DDI. É `security invoker`: a RLS decide quem aparece, e
 *   contato de outra organização nunca entra no aviso.
 * - `salvar_cadastro` grava o mesmo valor que validou (aparado pelo mesmo
 *   conjunto de espaços do TypeScript) e não deixa a ficha apagar e-mail,
 *   DDI ou telefone.
 *
 * Grava só na organização de teste, com dado aleatório por rodada, e apaga o
 * que criou.
 */

const novoSufixo = () => crypto.randomUUID().replace(/\D/g, "").slice(0, 8).padEnd(8, "0");

const TAB = String.fromCharCode(9);

describe("contato completo e parecidos (0040)", () => {
  let parceiro: Cliente;
  let duli: Cliente;
  let org: string;

  const s1 = novoSufixo();
  const s2 = novoSufixo();
  const s3 = novoSufixo();
  const emailCarlos = `carlos.${s1}@teste.dulihub`;
  const telCarlos = `31${s1}`;
  const telAntigo = `31${s2}`;
  const telLixeira = `31${s3}`;

  const ids = { carlos: "", antigo: "", lixeira: "", semEmail: "" };

  async function parecidos(
    quem: Cliente,
    entrada: { email?: string; ddi?: string; telefone?: string; ignorar?: string },
  ) {
    const { data, error } = await quem.rpc("contatos_parecidos", {
      p_email: entrada.email ?? "",
      p_ddi: entrada.ddi ?? "",
      p_telefone: entrada.telefone ?? "",
      ...(entrada.ignorar ? { p_ignorar: entrada.ignorar } : {}),
    });
    if (error) throw new Error(`contatos_parecidos: ${error.message}`);
    return data;
  }

  async function lerCarlos() {
    const { data, error } = await parceiro
      .from("people")
      .select("email, phone_country_code, phone")
      .eq("id", ids.carlos)
      .single();
    if (error) throw new Error(`Carlos ilegível: ${error.message}`);
    return data;
  }

  beforeAll(async () => {
    parceiro = await entrarComo("parceiro");
    duli = await entrarComo("colaborador");
    org = (await fixture(parceiro)).organization_id;

    const { data, error } = await parceiro
      .from("people")
      .insert([
        {
          organization_id: org,
          full_name: `Carlos ${s1}`,
          email: emailCarlos,
          phone_country_code: "+55",
          phone: telCarlos,
        },
        {
          organization_id: org,
          full_name: `Antigo ${s2}`,
          email: `antigo.${s2}@teste.dulihub`,
          phone_country_code: null,
          phone: telAntigo,
        },
        {
          organization_id: org,
          full_name: `Lixeira ${s3}`,
          email: `lixeira.${s3}@teste.dulihub`,
          phone_country_code: "+55",
          phone: telLixeira,
          deleted_at: new Date().toISOString(),
        },
        {
          organization_id: org,
          full_name: `SemEmail ${s1}`,
          email: null,
          phone_country_code: "+55",
          phone: `32${s1}`,
        },
      ])
      .select("id, full_name");
    if (error) throw new Error(`Contatos de apoio não criados: ${error.message}`);

    const id = (prefixo: string) => data.find((p) => p.full_name.startsWith(prefixo))!.id;
    ids.carlos = id("Carlos ");
    ids.antigo = id("Antigo ");
    ids.lixeira = id("Lixeira ");
    ids.semEmail = id("SemEmail ");
  }, 60_000);

  afterAll(async () => {
    const criados = Object.values(ids).filter(Boolean);
    if (criados.length) await parceiro.from("people").delete().in("id", criados);
  });

  // Guarda: o índice novo avalia as auxiliares com o papel de quem grava.
  // Sem o `grant` a `authenticated`, todo `insert` em `people` cai.
  it("a equipe grava e apaga contato completo pela API", async () => {
    const s = novoSufixo();
    const { data, error } = await parceiro
      .from("people")
      .insert({
        organization_id: org,
        full_name: `Fumaça ${s}`,
        email: `fumaca.${s}@teste.dulihub`,
        phone_country_code: "+55",
        phone: `33${s}`,
      })
      .select("id")
      .single();
    expect(error).toBeNull();

    const apagado = await parceiro.from("people").delete().eq("id", data!.id);
    expect(apagado.error).toBeNull();
  });

  it("acha pelo telefone com o DDI digitado junto", async () => {
    const lista = await parecidos(parceiro, { ddi: "+55", telefone: `55${telCarlos}` });
    expect(lista.some((p) => p.id === ids.carlos && p.bate_telefone)).toBe(true);
  });

  it("acha o contato antigo sem DDI", async () => {
    const lista = await parecidos(parceiro, { ddi: "+55", telefone: `55${telAntigo}` });
    expect(lista.some((p) => p.id === ids.antigo && p.bate_telefone)).toBe(true);
  });

  it("acha pelo e-mail com espaço e maiúscula", async () => {
    const lista = await parecidos(parceiro, { email: `  CARLOS.${s1}@Teste.Dulihub ` });
    expect(lista.some((p) => p.id === ids.carlos && p.bate_email)).toBe(true);
  });

  it("acha quem está na lixeira, marcado", async () => {
    const lista = await parecidos(parceiro, { ddi: "+55", telefone: telLixeira });
    const achado = lista.find((p) => p.id === ids.lixeira);
    expect(achado?.na_lixeira).toBe(true);
  });

  it("não avisa sobre o próprio contato", async () => {
    const lista = await parecidos(parceiro, {
      email: emailCarlos,
      ddi: "+55",
      telefone: telCarlos,
      ignorar: ids.carlos,
    });
    expect(lista.map((p) => p.id)).not.toContain(ids.carlos);
  });

  it("entrada vazia não bate com ninguém", async () => {
    expect(await parecidos(parceiro, {})).toHaveLength(0);
  });

  it("não mostra contato de outra organização", async () => {
    const lista = await parecidos(duli, { email: emailCarlos, ddi: "+55", telefone: telCarlos });
    expect(lista.map((p) => p.id)).not.toContain(ids.carlos);
  });

  it("um e-mail com tab é gravado aparado", async () => {
    const { error } = await parceiro.rpc("salvar_cadastro", {
      p_person: ids.carlos,
      p_dados: { email: `${TAB}${emailCarlos}` },
    });
    expect(error).toBeNull();
    expect((await lerCarlos()).email).toBe(emailCarlos);
  });

  it("DDI 55 grava como +55", async () => {
    const { error } = await parceiro.rpc("salvar_cadastro", {
      p_person: ids.carlos,
      p_dados: { phone_country_code: "55" },
    });
    expect(error).toBeNull();
    expect((await lerCarlos()).phone_country_code).toBe("+55");
  });

  it("a equipe não apaga o e-mail pela ficha", async () => {
    const { error } = await parceiro.rpc("salvar_cadastro", {
      p_person: ids.carlos,
      p_dados: { email: "" },
    });
    expect(error?.message).toBe("Informe o e-mail");
    expect((await lerCarlos()).email).toBe(emailCarlos);
  });

  it("a ficha completa exige o DDI", async () => {
    const { error } = await parceiro.rpc("salvar_cadastro", {
      p_person: ids.carlos,
      p_completo: true,
      p_dados: {
        full_name: `Carlos ${s1}`,
        birth_date: "1990-05-20",
        tax_id: "529.982.247-25",
        national_id: "1234567",
        national_id_issuer: "SSP/MG",
        gender: "masculino",
        marital_status: "casado",
        birthplace: "Belo Horizonte",
        nationality: "Brasileira",
        email: emailCarlos,
        phone_country_code: "",
        phone: telCarlos,
        address_street: "Rua da Bahia",
        address_number: "10",
        address_complement: "",
        address_district: "Centro",
        address_city: "Belo Horizonte",
        address_state: "MG",
        address_country: "Brasil",
        address_postal_code: "30160-010",
      },
    });
    expect(error?.message).toBe("Informe o DDI");
  });

  // Guarda: o e-mail é obrigatório na tela e na função, não `not null` na
  // coluna (spec §6.1). Os 4 contatos antigos sem e-mail continuam vivos.
  it("contato antigo sem e-mail ainda vai para a lixeira", async () => {
    const { error } = await parceiro
      .from("people")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", ids.semEmail);
    expect(error).toBeNull();

    const { data } = await parceiro
      .from("people")
      .select("deleted_at")
      .eq("id", ids.semEmail)
      .single();
    expect(data?.deleted_at).not.toBeNull();
  });
});
