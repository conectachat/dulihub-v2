// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { entrarComo, type Cliente } from "./clientes";

/**
 * A busca da lista de Clientes (0049; CLI-1): `buscar_clientes`.
 *
 * Acha por parte do nome, do e-mail ou dos dígitos do telefone — com ou sem
 * máscara e DDI —, traz só cliente fora da lixeira, e devolve em cada linha o
 * total do filtro, para a tela dizer "mostrando 50 de 72" em vez de cortar em
 * silêncio. `security invoker`: quem decide o que aparece é a RLS de `people`.
 *
 * Grava só na organização de teste, em pessoas descartáveis com um sufixo
 * aleatório no nome; todas são apagadas no fim.
 */

const aleatorio = () => crypto.randomUUID().replace(/\D/g, "").slice(0, 8).padEnd(8, "0");
const s = aleatorio();
// O telefone da Alfa tem dígitos próprios: o sufixo `s` está no nome e no
// e-mail de todas, e a busca por dígitos também olha nome e e-mail.
const f = aleatorio();
// Só letras: a busca por dígitos também olha nome e e-mail, e um "55" no
// sufixo acharia a pessoa pelo nome.
const letras = s.replace(/\d/g, (d) => "abcdefghij"[Number(d)]);

type Linha = { id: string; total: number };

describe("buscar_clientes (0049)", () => {
  let parceiro: Cliente;
  let duli: Cliente;
  const ids: Record<"alfa" | "beta" | "zeta" | "lead" | "lixeira" | "semFone", string> = {
    alfa: "",
    beta: "",
    zeta: "",
    lead: "",
    lixeira: "",
    semFone: "",
  };

  async function busca(c: Cliente, termo: string, limite = 50, deslocamento = 0) {
    const { data, error } = await c.rpc("buscar_clientes", {
      p_busca: termo,
      p_limite: limite,
      p_deslocamento: deslocamento,
    });
    if (error) throw new Error(`buscar_clientes("${termo}"): ${error.message}`);
    return (data ?? []) as Linha[];
  }

  const idsDe = (linhas: Linha[]) => linhas.map((l) => l.id);

  beforeAll(async () => {
    [parceiro, duli] = await Promise.all([entrarComo("parceiro"), entrarComo("colaborador")]);

    const { data: org } = await parceiro
      .from("organizations")
      .select("id")
      .eq("slug", "parceiro-teste")
      .single();
    if (!org) throw new Error("Organização de teste não encontrada.");

    const pessoas = [
      {
        chave: "alfa",
        full_name: `Busca ${s} Alfa`,
        email: `alfa.${s}@dominio${s}.dulihub`,
        phone: `319${f}`,
        lifecycle_stage: "client",
      },
      {
        chave: "beta",
        full_name: `Busca ${s} Beta`,
        email: `beta.${s}@teste.dulihub`,
        phone: `21${aleatorio()}`,
        lifecycle_stage: "client",
      },
      {
        chave: "zeta",
        full_name: `Busca ${s} Zeta 50%`,
        email: `zeta.${s}@teste.dulihub`,
        phone: `21${aleatorio()}`,
        lifecycle_stage: "client",
      },
      {
        chave: "lead",
        full_name: `Busca ${s} Lead`,
        email: `lead.${s}@teste.dulihub`,
        phone: `21${aleatorio()}`,
        lifecycle_stage: "opportunity",
      },
      {
        chave: "lixeira",
        full_name: `Busca ${s} Lixeira`,
        email: `lixeira.${s}@teste.dulihub`,
        phone: `21${aleatorio()}`,
        lifecycle_stage: "client",
        deleted_at: new Date().toISOString(),
      },
      {
        // Fora do prefixo "Busca": não entra nas contagens dos outros testes.
        chave: "semFone",
        full_name: `Sem telefone ${letras}`,
        email: `semfone.${letras}@teste.dulihub`,
        phone: null,
        lifecycle_stage: "client",
      },
    ] as const;

    for (const { chave, ...p } of pessoas) {
      const { data, error } = await parceiro
        .from("people")
        .insert({ ...p, organization_id: org.id, phone_country_code: "+55" })
        .select("id")
        .single();
      if (error) throw new Error(`Pessoa descartável "${chave}" não criada: ${error.message}`);
      ids[chave] = data.id;
    }
  }, 60_000);

  afterAll(async () => {
    const criados = Object.values(ids).filter(Boolean);
    if (criados.length) await parceiro.from("people").delete().in("id", criados);
  });

  it("acha por parte do nome, sem diferença de maiúscula", async () => {
    expect(idsDe(await busca(parceiro, `${s} alf`))).toEqual([ids.alfa]);
  });

  it("acha pelo domínio do e-mail", async () => {
    expect(idsDe(await busca(parceiro, `@dominio${s}`))).toEqual([ids.alfa]);
  });

  it("acha por um trecho dos dígitos do telefone", async () => {
    expect(idsDe(await busca(parceiro, f.slice(2)))).toEqual([ids.alfa]);
  });

  it("acha pelo telefone com máscara, com ou sem DDI", async () => {
    const comMascara = `(31) 9${f.slice(0, 4)}-${f.slice(4)}`;

    expect(idsDe(await busca(parceiro, `+55 ${comMascara}`))).toEqual([ids.alfa]);
    expect(idsDe(await busca(parceiro, comMascara))).toEqual([ids.alfa]);
  });

  it("busca com letra não procura no telefone", async () => {
    // O telefone da Alfa contém esses dígitos; "xyz <dígitos>" não é telefone.
    expect(await busca(parceiro, `xyz ${f}`)).toEqual([]);
  });

  it("não traz lead nem quem está na lixeira, e ordena por nome", async () => {
    expect(idsDe(await busca(parceiro, `Busca ${s}`))).toEqual([ids.alfa, ids.beta, ids.zeta]);
  });

  it("o total é o do filtro, não o da página", async () => {
    const pagina1 = await busca(parceiro, `Busca ${s}`, 2, 0);
    const pagina2 = await busca(parceiro, `Busca ${s}`, 2, 2);

    expect(idsDe(pagina1)).toEqual([ids.alfa, ids.beta]);
    expect(idsDe(pagina2)).toEqual([ids.zeta]);
    expect([...pagina1, ...pagina2].map((l) => Number(l.total))).toEqual([3, 3, 3]);
  });

  it("% e _ na busca são letras, não curinga", async () => {
    // Como curinga, `%` casaria o espaço e `_` casaria o "A" de Alfa.
    expect(await busca(parceiro, `${s}%Zeta`)).toEqual([]);
    expect(await busca(parceiro, `${s} _lfa`)).toEqual([]);
    expect(idsDe(await busca(parceiro, `Zeta 50%`))).toContain(ids.zeta);
  });

  it("outra organização não vê os clientes, e o parceiro não vê os da Duli", async () => {
    expect(await busca(duli, `Busca ${s}`)).toEqual([]);

    const { data: duliOrg } = await duli.from("organizations").select("id").eq("slug", "duli").single();
    const { data: daDuli, error } = await duli
      .from("people")
      .select("id")
      .eq("organization_id", duliOrg!.id)
      .eq("lifecycle_stage", "client")
      .is("deleted_at", null)
      .limit(1)
      .single();
    if (error) throw new Error(`Nenhum cliente da Duli para o teste: ${error.message}`);

    expect(idsDe(await busca(parceiro, "", 1000))).not.toContain(daDuli.id);
  });

  it("cliente sem telefone não aparece numa busca por dígitos", async () => {
    // Sem número, sobrava só o DDI ("55"), e "55" achava todo cliente sem telefone.
    expect(idsDe(await busca(parceiro, "55", 1000))).not.toContain(ids.semFone);
    expect(idsDe(await busca(parceiro, `Sem telefone ${letras}`))).toEqual([ids.semFone]);
  });
});
