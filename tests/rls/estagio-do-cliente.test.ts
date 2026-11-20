// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { entrarComo, fixture, type Cliente } from "./clientes";

/**
 * Estágio do cliente, garantido no banco (0045; CLI-11 a CLI-14).
 *
 * - Cliente não volta a ser lead, por caminho nenhum (M17).
 * - Passar a cliente grava o "cliente desde" com a data de hoje em São
 *   Paulo; quem já tem data não a perde, e o insert não a inventa.
 * - Quem tem processo ou cobrança é cliente: criar um ou outro para quem
 *   ainda não é cliente o promove, mas só pela gestão, e fica no histórico.
 *   Fora da gestão, recusa — também por troca de `person_id`.
 * - `marcar_como_cliente`: só a gestão, com data opcional e nunca no futuro.
 * - O cliente do portal não muda o próprio estágio nem a própria data: a
 *   mudança é desfeita em silêncio.
 *
 * Grava só na organização de teste, em pessoas descartáveis, apagadas no fim
 * (a cascata leva processo, cobrança e histórico). A exceção é o "Cliente de
 * Teste", única pessoa com login de cliente: o que se muda nele é guardado
 * antes e restaurado em `finally`.
 */

const s = crypto.randomUUID().replace(/\D/g, "").slice(0, 8).padEnd(8, "0");

const SO_A_GESTAO_PROMOVE = "Só a gestão torna alguém cliente; use o Ganho.";

/** Hoje no fuso de São Paulo, como o banco calcula. */
function hojeEmSaoPaulo(deslocamentoEmDias = 0): string {
  const data = new Date(Date.now() + deslocamentoEmDias * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(data);
}

type Estagio = "contact" | "opportunity" | "client";

describe("estágio do cliente (0045)", () => {
  let parceiro: Cliente;
  let staff: Cliente;
  let portal: Cliente;
  let org: string;
  let vistoId: string;
  const criadas: string[] = [];
  let contador = 0;

  async function novaPessoa(
    estagio: Estagio,
    extra: { client_since?: string; deleted_at?: string } = {},
  ): Promise<string> {
    contador += 1;
    const { data, error } = await parceiro
      .from("people")
      .insert({
        organization_id: org,
        full_name: `Estágio ${s} ${contador}`,
        email: `estagio.${s}.${contador}@teste.dulihub`,
        phone_country_code: "+55",
        phone: `3${String(contador).padStart(2, "0")}${s}`,
        lifecycle_stage: estagio,
        ...extra,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Pessoa descartável não criada: ${error.message}`);
    criadas.push(data.id);
    return data.id;
  }

  async function pessoa(id: string) {
    const { data, error } = await parceiro
      .from("people")
      .select("lifecycle_stage, client_since")
      .eq("id", id)
      .single();
    if (error) throw new Error(`Pessoa ilegível: ${error.message}`);
    return data;
  }

  async function viraramCliente(id: string) {
    const { data, error } = await parceiro
      .from("activities")
      .select("description, created_by")
      .eq("person_id", id)
      .eq("type", "virou_cliente");
    if (error) throw new Error(`Histórico ilegível: ${error.message}`);
    return data;
  }

  beforeAll(async () => {
    [parceiro, staff, portal] = await Promise.all([
      entrarComo("parceiro"),
      entrarComo("staff"),
      entrarComo("cliente"),
    ]);
    org = (await fixture(parceiro)).organization_id;

    const { data: visto, error } = await parceiro
      .from("visa_types")
      .select("id")
      .eq("name", "Visto do Parceiro")
      .maybeSingle();
    if (error) throw new Error(`Visto da fixture ilegível: ${error.message}`);
    if (!visto) throw new Error("Visto da fixture não existe. Aplique a 0021.");
    vistoId = visto.id;
  }, 60_000);

  afterAll(async () => {
    if (criadas.length) await parceiro.from("people").delete().in("id", criadas);
  });

  describe("não volta", () => {
    it("rebaixar um cliente pela API é recusado, para a gestão e para a equipe", async () => {
      const id = await novaPessoa("client");

      for (const quem of [parceiro, staff]) {
        const { error } = await quem
          .from("people")
          .update({ lifecycle_stage: "opportunity" })
          .eq("id", id);
        expect(error?.code).toBe("P0001");
        expect(error?.message).toBe("Cliente não volta a ser lead.");
      }
      expect((await pessoa(id)).lifecycle_stage).toBe("client");
    });

    it("o cliente do portal tentando se rebaixar: desfeito em silêncio", async () => {
      const cliente = await fixture(parceiro);
      const { error } = await portal
        .from("people")
        .update({ lifecycle_stage: "contact" })
        .eq("id", cliente.id);

      expect(error).toBeNull();
      expect((await pessoa(cliente.id)).lifecycle_stage).toBe("client");
    });
  });

  describe("cliente desde", () => {
    it("passar a cliente grava a data de hoje em São Paulo", async () => {
      const id = await novaPessoa("opportunity");

      const { error } = await parceiro
        .from("people")
        .update({ lifecycle_stage: "client" })
        .eq("id", id);

      expect(error).toBeNull();
      expect(await pessoa(id)).toEqual({ lifecycle_stage: "client", client_since: hojeEmSaoPaulo() });
    });

    it("quem já é cliente não tem a data trocada", async () => {
      const id = await novaPessoa("client", { client_since: "2020-01-15" });

      await parceiro
        .from("people")
        .update({ lifecycle_stage: "client", full_name: `Estágio ${s} renomeado` })
        .eq("id", id);

      expect((await pessoa(id)).client_since).toBe("2020-01-15");
    });

    it("o insert já como cliente não inventa a data", async () => {
      const id = await novaPessoa("client");

      expect((await pessoa(id)).client_since).toBeNull();
    });

    it("o cliente do portal não muda a própria data: desfeito em silêncio", async () => {
      const cliente = await fixture(parceiro);
      const antes = (await pessoa(cliente.id)).client_since;
      const outra = antes === "2019-06-01" ? "2019-06-02" : "2019-06-01";

      try {
        const { error } = await portal
          .from("people")
          .update({ client_since: outra })
          .eq("id", cliente.id);

        expect(error).toBeNull();
        expect((await pessoa(cliente.id)).client_since).toBe(antes);
      } finally {
        await parceiro.from("people").update({ client_since: antes }).eq("id", cliente.id);
      }
    });
  });

  // Regra (2) da spec, que a 0054 liga: o caminho é o Ganho, a marcação da
  // gestão ou a gestão criando processo ou cobrança.
  describe("quem torna cliente (0054)", () => {
    it("fora da gestão, passar um lead a cliente por update é recusado", async () => {
      const id = await novaPessoa("opportunity");

      const { error } = await staff.from("people").update({ lifecycle_stage: "client" }).eq("id", id);

      expect(error?.code).toBe("P0001");
      expect(error?.message).toBe(SO_A_GESTAO_PROMOVE);
      expect(await pessoa(id)).toEqual({ lifecycle_stage: "opportunity", client_since: null });
    });

    it("fora da gestão, inserir já como cliente é recusado; a gestão insere", async () => {
      const { data, error } = await staff
        .from("people")
        .insert({ organization_id: org, full_name: `Estágio ${s} do staff`, lifecycle_stage: "client" })
        .select("id");
      for (const linha of data ?? []) criadas.push(linha.id);

      expect(error?.code).toBe("P0001");
      expect(error?.message).toBe(SO_A_GESTAO_PROMOVE);

      const daGestao = await novaPessoa("client");
      expect((await pessoa(daGestao)).lifecycle_stage).toBe("client");
    });

    it("fora da gestão, editar quem já é cliente continua passando", async () => {
      const id = await novaPessoa("client");

      const { error } = await staff
        .from("people")
        .update({ lifecycle_stage: "client", full_name: `Estágio ${s} editado pelo staff` })
        .eq("id", id);

      expect(error).toBeNull();
    });
  });

  describe("quem tem processo ou cobrança é cliente", () => {
    it("fora da gestão, processo para um lead é recusado e nada muda", async () => {
      const id = await novaPessoa("opportunity");

      const { data, error } = await staff.rpc("criar_processo", {
        p_person: id,
        p_visa_type: vistoId,
        p_title: `Processo ${s}`,
      });

      expect(data).toBeNull();
      expect(error?.code).toBe("P0001");
      expect(error?.message).toBe(SO_A_GESTAO_PROMOVE);
      expect((await pessoa(id)).lifecycle_stage).toBe("opportunity");
      const { data: processos } = await parceiro.from("projects").select("id").eq("person_id", id);
      expect(processos).toEqual([]);
    });

    it("fora da gestão, cobrança para um lead é recusada", async () => {
      const id = await novaPessoa("contact");

      const { error } = await staff
        .from("receivables")
        .insert({ organization_id: org, person_id: id, title: `Cobrança ${s}`, amount: 100 });

      expect(error?.code).toBe("P0001");
      expect(error?.message).toBe(SO_A_GESTAO_PROMOVE);
      expect((await pessoa(id)).lifecycle_stage).toBe("contact");
    });

    it("a gestão cria processo para um lead: vira cliente hoje, com histórico", async () => {
      const id = await novaPessoa("opportunity");
      const parceiroId = (await parceiro.auth.getUser()).data.user!.id;

      const { error } = await parceiro.rpc("criar_processo", {
        p_person: id,
        p_visa_type: vistoId,
        p_title: `Processo ${s}`,
      });

      expect(error).toBeNull();
      expect(await pessoa(id)).toEqual({ lifecycle_stage: "client", client_since: hojeEmSaoPaulo() });
      expect(await viraramCliente(id)).toEqual([
        { description: `Virou cliente (processo Processo ${s})`, created_by: parceiroId },
      ]);
    });

    it("a gestão cria cobrança para um lead: vira cliente, com histórico; a segunda não repete", async () => {
      const id = await novaPessoa("contact");

      const primeira = await parceiro
        .from("receivables")
        .insert({ organization_id: org, person_id: id, title: `Cobrança ${s}`, amount: 100 });
      expect(primeira.error).toBeNull();
      expect((await pessoa(id)).lifecycle_stage).toBe("client");

      const segunda = await parceiro
        .from("receivables")
        .insert({ organization_id: org, person_id: id, title: `Outra ${s}`, amount: 50 });
      expect(segunda.error).toBeNull();
      const processo = await parceiro.rpc("criar_processo", {
        p_person: id,
        p_visa_type: vistoId,
        p_title: `Processo ${s}`,
      });
      expect(processo.error).toBeNull();

      const historico = await viraramCliente(id);
      expect(historico.map((h) => h.description)).toEqual([`Virou cliente (cobrança Cobrança ${s})`]);
    });

    it("trocar o contato de um processo ou de uma cobrança para um lead, fora da gestão, é recusado", async () => {
      const cliente = await novaPessoa("client");
      const lead = await novaPessoa("opportunity");

      const { data: processoId, error: erroProcesso } = await parceiro.rpc("criar_processo", {
        p_person: cliente,
        p_visa_type: vistoId,
        p_title: `Processo ${s}`,
      });
      if (erroProcesso) throw new Error(erroProcesso.message);
      const { data: cobranca, error: erroCobranca } = await parceiro
        .from("receivables")
        .insert({ organization_id: org, person_id: cliente, title: `Cobrança ${s}`, amount: 10 })
        .select("id")
        .single();
      if (erroCobranca) throw new Error(erroCobranca.message);

      const noProcesso = await staff.from("projects").update({ person_id: lead }).eq("id", processoId!);
      expect(noProcesso.error?.message).toBe(SO_A_GESTAO_PROMOVE);
      const naCobranca = await staff
        .from("receivables")
        .update({ person_id: lead })
        .eq("id", cobranca.id);
      expect(naCobranca.error?.message).toBe(SO_A_GESTAO_PROMOVE);

      expect((await pessoa(lead)).lifecycle_stage).toBe("opportunity");
    });
  });

  describe("marcar como cliente", () => {
    async function marcar(quem: Cliente, id: string, desde?: string) {
      return quem.rpc("marcar_como_cliente", {
        p_pessoa: id,
        ...(desde ? { p_desde: desde } : {}),
      });
    }

    it("fora da gestão é recusado", async () => {
      const id = await novaPessoa("opportunity");

      const { error } = await marcar(staff, id);

      expect(error?.code).toBe("P0001");
      expect(error?.message).toBe("Só a gestão marca alguém como cliente.");
      expect((await pessoa(id)).lifecycle_stage).toBe("opportunity");
    });

    it("a gestão marca com a data escolhida, e fica no histórico", async () => {
      const id = await novaPessoa("opportunity");

      const { error } = await marcar(parceiro, id, "2025-03-10");

      expect(error).toBeNull();
      expect(await pessoa(id)).toEqual({ lifecycle_stage: "client", client_since: "2025-03-10" });
      expect((await viraramCliente(id)).map((h) => h.description)).toEqual(["Marcado como cliente"]);
    });

    it("sem data, fica hoje", async () => {
      const id = await novaPessoa("contact");

      expect((await marcar(parceiro, id)).error).toBeNull();
      expect((await pessoa(id)).client_since).toBe(hojeEmSaoPaulo());
    });

    it("data no futuro é recusada", async () => {
      const id = await novaPessoa("contact");

      const { error } = await marcar(parceiro, id, hojeEmSaoPaulo(2));

      expect(error?.code).toBe("P0001");
      expect(error?.message).toBe("A data de cliente não pode ser no futuro.");
    });

    it("quem já é cliente, quem está na lixeira e quem não existe são recusados", async () => {
      const cliente = await novaPessoa("client");
      const naLixeira = await novaPessoa("opportunity", { deleted_at: new Date().toISOString() });

      const casos: [string, string][] = [
        [cliente, "Já é cliente."],
        [naLixeira, "Este contato está na lixeira. Restaure antes."],
        [crypto.randomUUID(), "Contato não encontrado."],
      ];
      for (const [id, frase] of casos) {
        const { error } = await marcar(parceiro, id);
        expect(error?.code).toBe("P0001");
        expect(error?.message).toBe(frase);
      }
    });
  });
});
