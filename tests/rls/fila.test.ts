// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  drenar,
  mesmaVersao,
  type ArmazemDaFila,
  type ItemDaFila,
  type Operacao,
} from "@/lib/local/fila";
import { transporteDaFila } from "@/lib/local/transporte-da-fila";

import { entrarComo, type Cliente } from "./clientes";

/**
 * A fila subindo contra o banco **de verdade**.
 *
 * `src/lib/local/fila.test.ts` prova a lógica sem rede. Este prova o que só o
 * banco pode dizer: que subir pela fila passa pela mesma RLS de sempre, que
 * recusa vira conflito visível em vez de silêncio, e que repetir um item —
 * o que acontece quando a resposta se perde — não duplica nem apaga duas
 * vezes.
 */

function armazem(itens: ItemDaFila[]): ArmazemDaFila & { itens: ItemDaFila[] } {
  return {
    itens,
    async listar() {
      return [...itens].sort((a, b) => a.criada_em.localeCompare(b.criada_em));
    },
    async gravar(item) {
      const i = itens.findIndex((x) => x.id === item.id);
      if (i >= 0) itens[i] = item;
      else itens.push(item);
    },
    async apagar(id) {
      const i = itens.findIndex((x) => x.id === id);
      if (i >= 0) itens.splice(i, 1);
    },
    async apagarSeIgual(item) {
      const i = itens.findIndex((x) => x.id === item.id);
      if (i >= 0 && mesmaVersao(itens[i], item)) itens.splice(i, 1);
    },
    async gravarSeIgual(anterior, novo) {
      const i = itens.findIndex((x) => x.id === anterior.id);
      if (i >= 0 && mesmaVersao(itens[i], anterior)) itens[i] = novo;
    },
  };
}

function item(id: string, alvo: string, passos: Operacao[]): ItemDaFila {
  return {
    id,
    alvo,
    depende: [],
    passos,
    rotulo: `item ${id}`,
    criada_em: new Date().toISOString(),
    estado: "pendente",
    enviada_em: null,
    motivo: null,
  };
}

describe("fila contra o banco", () => {
  let parceiro: Cliente;
  let duli: Cliente;
  let org: string;
  /**
   * Uma tag do parceiro, que a Duli não enxerga: o alvo das recusas.
   *
   * O ataque é a Duli sobre o parceiro, e não o contrário, porque escrever em
   * configuração é de quem administra a organização (0018) — a conta de
   * colaborador da casa não cria tag nem na própria.
   */
  let doParceiro: string;
  const criadas: string[] = [];

  beforeAll(async () => {
    parceiro = await entrarComo("parceiro");
    duli = await entrarComo("colaborador");

    const { data, error } = await parceiro
      .from("organization_members")
      .select("organization_id")
      .limit(1)
      .single();
    if (error) throw new Error(`Organização ilegível: ${error.message}`);
    org = data.organization_id;

    const criada = await parceiro
      .from("tags")
      .insert({ organization_id: org, name: `Tag do parceiro ${Date.now()}` })
      .select("id")
      .single();
    if (criada.error) throw new Error(`Tag do parceiro não criada: ${criada.error.message}`);
    doParceiro = criada.data.id;
  }, 60_000);

  afterAll(async () => {
    if (criadas.length) await parceiro.from("tags").delete().in("id", criadas);
    if (doParceiro) await parceiro.from("tags").delete().eq("id", doParceiro);
  });

  it("parceiro cadastrado por quem não é dono da Duli vira conflito, com o motivo", async () => {
    // Critério 14 do PAR-4: offline o botão nem aparece para quem não é dono,
    // mas a fila de outro aparelho pode trazer a gravação. O banco recusa
    // (0036 e 0068, código 42501), e a Sincronização mostra o motivo.
    const id = crypto.randomUUID();
    const fila = armazem([
      item("parceiro", id, [
        {
          tipo: "insert",
          tabela: "organizations",
          linha: {
            id,
            type: "partner",
            name: `Parceiro pela fila ${Date.now()}`,
            address_country: "Brasil",
            email: "fila@exemplo.com",
            phone_country_code: "+55",
            phone: "11999990005",
          },
        },
      ]),
    ]);

    const resultado = await drenar(transporteDaFila(parceiro), fila);

    expect(resultado.subiram).toBe(0);
    expect(fila.itens[0].estado).toBe("conflito");
    expect(fila.itens[0].motivo).toBe("Você não tem permissão para isto.");
    const { data } = await duli.from("organizations").select("id").eq("id", id);
    expect(data).toEqual([]);
  });

  it("o que a RLS esconde vira conflito, não silêncio", async () => {
    // O update da Duli sobre a tag do parceiro não casa linha nenhuma, e o
    // PostgREST não devolve erro — exatamente o caso que a fila precisa
    // contar para não limpar o item como se tivesse subido.
    const fila = armazem([
      item("a", doParceiro, [
        { tipo: "update", tabela: "tags", id: doParceiro, patch: { name: "Invadida" } },
      ]),
    ]);

    const resultado = await drenar(transporteDaFila(duli), fila);

    expect(resultado.subiram).toBe(0);
    expect(resultado.conflitos).toBe(1);
    expect(fila.itens[0].estado).toBe("conflito");
    expect(fila.itens[0].motivo).toMatch(/Nada foi alterado/);

    // E a tag do parceiro continua como estava.
    const depois = await parceiro.from("tags").select("name").eq("id", doParceiro).single();
    expect(depois.data?.name).not.toBe("Invadida");
  }, 60_000);

  it("resposta perdida: o mesmo item duas vezes deixa uma linha só", async () => {
    const id = crypto.randomUUID();
    criadas.push(id);
    const linha = { id, organization_id: org, name: `Tag da fila ${Date.now()}` };

    const primeira = armazem([item("a", id, [{ tipo: "insert", tabela: "tags", linha }])]);
    const segunda = armazem([item("a", id, [{ tipo: "insert", tabela: "tags", linha }])]);

    expect((await drenar(transporteDaFila(parceiro), primeira)).subiram).toBe(1);
    // O replay bate na chave primária: já subiu, não é erro.
    const repetida = await drenar(transporteDaFila(parceiro), segunda);

    expect(repetida.subiram).toBe(1);
    expect(repetida.conflitos).toBe(0);
    expect(segunda.itens).toEqual([]);

    const { count } = await parceiro
      .from("tags")
      .select("id", { count: "exact", head: true })
      .eq("id", id);
    expect(count).toBe(1);
  }, 60_000);

  it("delete repetido não vira conflito falso", async () => {
    const id = crypto.randomUUID();
    const { error } = await parceiro
      .from("tags")
      .insert({ id, organization_id: org, name: `Tag efêmera ${Date.now()}` });
    if (error) throw new Error(`Tag não criada: ${error.message}`);

    const passos: Operacao[] = [{ tipo: "delete", tabela: "tags", id }];
    const primeira = armazem([item("a", id, passos)]);
    const segunda = armazem([item("a", id, passos)]);

    expect((await drenar(transporteDaFila(parceiro), primeira)).subiram).toBe(1);
    const repetida = await drenar(transporteDaFila(parceiro), segunda);

    expect(repetida.subiram).toBe(1);
    expect(repetida.conflitos).toBe(0);
  }, 60_000);

  it("a Duli não apaga tag do parceiro pela fila", async () => {
    // A garantia é do banco, e é ela que importa: a tag continua lá.
    //
    // A fila **não** marca conflito aqui, e é deliberado. Ela pergunta se a
    // linha ainda existe antes de decidir, e essa pergunta também passa pela
    // RLS: linha que a policy esconde responde "não existe". Do ponto de
    // vista de quem pediu, o apagar fez o que devia — o que não pode é o
    // contrário, a linha sumir de verdade.
    //
    // Chegar aqui já exigiria um espelho com linha que aquele login nunca
    // poderia ter recebido, já que ele é cópia do que o servidor devolveu.
    // E o caso perigoso de verdade — apagar algo cuja criação foi recusada —
    // é barrado antes, pelo bloqueio por alvo.
    const fila = armazem([
      item("a", doParceiro, [{ tipo: "delete", tabela: "tags", id: doParceiro }]),
    ]);
    await drenar(transporteDaFila(duli), fila);

    const ainda = await parceiro.from("tags").select("id").eq("id", doParceiro).maybeSingle();
    expect(ainda.data?.id).toBe(doParceiro);
  }, 60_000);

  it("cobrança pela fila para um lead, fora da gestão, vira conflito e nada é gravado (0045)", async () => {
    // O `teste-staff` é staff do Parceiro de Teste: a recusa é a regra de
    // quem promove, não a RLS. O `colaborador` é da Duli, onde pessoa não se
    // apaga — o lead descartável ficaria para sempre.
    const staff = await entrarComo("staff");
    const sufixo = crypto.randomUUID().replace(/\D/g, "").slice(0, 8).padEnd(8, "0");
    const { data: lead, error } = await parceiro
      .from("people")
      .insert({
        organization_id: org,
        full_name: `Lead da fila ${sufixo}`,
        email: `lead.fila.${sufixo}@teste.dulihub`,
        phone_country_code: "+55",
        phone: `31${sufixo}0`,
        lifecycle_stage: "opportunity",
      })
      .select("id")
      .single();
    if (error) throw new Error(`Lead descartável não criado: ${error.message}`);

    try {
      const cobranca = crypto.randomUUID();
      const fila = armazem([
        item("a", cobranca, [
          {
            tipo: "insert",
            tabela: "receivables",
            linha: {
              id: cobranca,
              organization_id: org,
              person_id: lead.id,
              title: `Cobrança da fila ${sufixo}`,
              amount: 100,
            },
          },
        ]),
      ]);

      const resultado = await drenar(transporteDaFila(staff), fila);

      expect(resultado.subiram).toBe(0);
      expect(resultado.conflitos).toBe(1);
      expect(fila.itens[0].estado).toBe("conflito");
      expect(fila.itens[0].motivo).toContain("Só a gestão torna alguém cliente; use o Ganho.");

      const { data: gravadas } = await parceiro
        .from("receivables")
        .select("id")
        .eq("person_id", lead.id);
      expect(gravadas).toEqual([]);
    } finally {
      await parceiro.from("people").delete().eq("id", lead.id);
    }
  }, 60_000);
});
