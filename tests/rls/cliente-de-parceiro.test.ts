// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { entrarComo, type Cliente } from "./clientes";

/**
 * O cliente de parceiro no banco (0070; PAR-5, PAR-6, PAR-9, PAR-10).
 *
 * A `teste-executora` faz o papel da Duli: é `admin` da `executora-teste`,
 * onde os clientes moram, e `staff` da `parceiro-teste`, que é o parceiro
 * deles (0069). `teste-parceiro` e `teste-staff` são do parceiro e não da
 * executora — são eles que provam que o vínculo não dá acesso nenhum.
 *
 * Tudo o que nasce é apagado pela executora no fim (a `people_delete` da 0036
 * deixa a gestão apagar na organização de teste, e a pessoa leva tudo).
 */

const s = crypto.randomUUID().replace(/\D/g, "").slice(0, 8).padEnd(8, "0");
const letras = s.replace(/\d/g, (d) => "abcdefghij"[Number(d)]);

const MSG = {
  gestao: "Só a gestão marca alguém como cliente.",
  nome: "Informe o nome do cliente.",
  longo: "Texto longo demais em um dos campos.",
  parceiro: "Parceiro não encontrado.",
  umDosDois: "Escolha um contato ou preencha um novo",
  vinculo: "O parceiro do cliente só se define no Novo cliente.",
};

function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** O jsonb de `criar_cliente`, lido por esquema. */
const respostaSchema = z.union([
  z.object({ situacao: z.literal("criado"), pessoa: z.string() }),
  z.object({
    situacao: z.literal("precisa_confirmar"),
    homonimos: z.array(z.object({ id: z.string(), nome: z.string() })),
    parceiro: z.string(),
  }),
]);

describe("cliente de parceiro (0070)", () => {
  let executora: Cliente;
  let parceiro: Cliente;
  let staff: Cliente;
  let cliente: Cliente;
  let executoraId: string;
  let orgExecutora: string;
  let orgParceiro: string;
  const criadas: string[] = [];

  beforeAll(async () => {
    executora = await entrarComo("executora");
    parceiro = await entrarComo("parceiro");
    staff = await entrarComo("staff");
    cliente = await entrarComo("cliente");
    executoraId = (await executora.auth.getUser()).data.user!.id;

    const { data: orgs, error } = await executora
      .from("organizations")
      .select("id, slug")
      .in("slug", ["executora-teste", "parceiro-teste"]);
    if (error) throw new Error(`Organizações ilegíveis: ${error.message}`);
    orgExecutora = orgs!.find((o) => o.slug === "executora-teste")!.id;
    orgParceiro = orgs!.find((o) => o.slug === "parceiro-teste")!.id;
  }, 60_000);

  afterAll(async () => {
    if (criadas.length) await executora.from("people").delete().in("id", criadas);
  });

  /** Novo cliente › Parceiro, pela executora. */
  async function criarDeParceiro(nome: string, confirmar = false, quem?: Cliente) {
    const { data, error } = await (quem ?? executora).rpc("criar_cliente", {
      p_organizacao: orgExecutora,
      p_parceiro: orgParceiro,
      p_novo_contato: { full_name: nome },
      p_confirmar_contato_parecido: confirmar,
    });
    if (error) return { erro: error.message, resposta: null };
    const resposta = respostaSchema.parse(data);
    if (resposta.situacao === "criado") criadas.push(resposta.pessoa);
    return { erro: null, resposta };
  }

  async function novoCliente(nome: string) {
    const { erro, resposta } = await criarDeParceiro(nome);
    if (erro || resposta?.situacao !== "criado") throw new Error(`Não nasceu: ${erro}`);
    return resposta.pessoa;
  }

  describe("Novo cliente › Parceiro", () => {
    it("nasce cliente da executora, com o vínculo, sem contato próprio e com o histórico", async () => {
      const id = await novoCliente(`Fulano ${letras}`);

      const { data: pessoa } = await executora
        .from("people")
        .select(
          "organization_id, partner_organization_id, email, phone_country_code, phone, lifecycle_stage, client_since, owner_id",
        )
        .eq("id", id)
        .single();
      expect(pessoa).toEqual({
        organization_id: orgExecutora,
        partner_organization_id: orgParceiro,
        email: null,
        phone_country_code: null,
        phone: null,
        lifecycle_stage: "client",
        client_since: hojeEmSaoPaulo(),
        owner_id: executoraId,
      });

      const { data: historico } = await executora
        .from("activities")
        .select("description")
        .eq("person_id", id)
        .eq("type", "virou_cliente");
      expect(historico).toEqual([{ description: "Marcado como cliente — parceiro Parceiro de Teste" }]);
    });

    it("recusa quem não é da gestão da organização", async () => {
      const { erro } = await criarDeParceiro(`Do staff ${letras}`, false, staff);
      expect(erro).toBe(MSG.gestao);
    });

    it("recusa nome vazio ou longo demais", async () => {
      expect((await criarDeParceiro("   ")).erro).toBe(MSG.nome);
      expect((await criarDeParceiro("x".repeat(201))).erro).toBe(MSG.longo);
    });

    it("recusa parceiro que não existe, a própria organização e contato junto", async () => {
      const outro = async (args: Record<string, unknown>) =>
        (
          await executora.rpc("criar_cliente", {
            p_organizacao: orgExecutora,
            p_novo_contato: { full_name: `Sem parceiro ${letras}` },
            ...args,
          })
        ).error?.message;

      expect(await outro({ p_parceiro: crypto.randomUUID() })).toBe(MSG.parceiro);
      expect(await outro({ p_parceiro: orgExecutora })).toBe(MSG.parceiro);
      expect(await outro({ p_parceiro: orgParceiro, p_contato: crypto.randomUUID() })).toBe(
        MSG.umDosDois,
      );
    });
  });

  describe("nome repetido no mesmo parceiro", () => {
    it("pergunta antes, sem caixa e sem espaço nas pontas; confirmado, cria", async () => {
      const primeiro = await novoCliente(`Repetido ${letras}`);

      const segundo = await criarDeParceiro(`  repetido ${letras.toUpperCase()} `);
      expect(segundo.resposta).toEqual({
        situacao: "precisa_confirmar",
        homonimos: [{ id: primeiro, nome: `Repetido ${letras}` }],
        parceiro: "Parceiro de Teste",
      });

      const confirmado = await criarDeParceiro(`repetido ${letras}`, true);
      expect(confirmado.resposta?.situacao).toBe("criado");
    });

    it("não pergunta pelo homônimo na lixeira nem pelo cliente direto", async () => {
      const naLixeira = await novoCliente(`Lixeira ${letras}`);
      await executora.from("people").update({ deleted_at: new Date().toISOString() }).eq("id", naLixeira);

      const { resposta } = await criarDeParceiro(`Lixeira ${letras}`);
      expect(resposta?.situacao).toBe("criado");

      const direto = await executora.rpc("criar_cliente", {
        p_organizacao: orgExecutora,
        p_novo_contato: {
          full_name: `Direto ${letras}`,
          email: `direto.${letras}@exemplo.com`,
          phone_country_code: "+55",
          phone: `119${s}`,
        },
        p_confirmar_contato_parecido: true,
      });
      expect(direto.error).toBeNull();
      const respostaDireto = respostaSchema.parse(direto.data);
      if (respostaDireto.situacao === "criado") criadas.push(respostaDireto.pessoa);

      const deParceiro = await criarDeParceiro(`Direto ${letras}`);
      expect(deParceiro.resposta?.situacao).toBe("criado");
    });
  });

  describe("o vínculo é fixo", () => {
    it("nenhum membro troca nem apaga o vínculo", async () => {
      const id = await novoCliente(`Fixo ${letras}`);

      for (const valor of [null, orgExecutora]) {
        const { error } = await executora
          .from("people")
          .update({ partner_organization_id: valor })
          .eq("id", id);
        expect(error?.message).toBe(MSG.vinculo);
      }
    });

    it("pessoa nova já com o vínculo, fora do Novo cliente, é recusada", async () => {
      const { error } = await executora.from("people").insert({
        organization_id: orgExecutora,
        full_name: `Por fora ${letras}`,
        partner_organization_id: orgParceiro,
      });
      expect(error?.message).toBe(MSG.vinculo);
    });

    it("o cliente do portal não põe vínculo na própria linha", async () => {
      const eu = (await cliente.auth.getUser()).data.user!.id;
      await cliente.from("people").update({ partner_organization_id: orgParceiro }).eq("user_id", eu);
      const { data } = await cliente
        .from("people")
        .select("partner_organization_id")
        .eq("user_id", eu)
        .single();
      expect(data?.partner_organization_id).toBeNull();
    });
  });

  describe("o vínculo não dá acesso nenhum", () => {
    it("os membros do parceiro não enxergam o cliente, a nota nem a cobrança", async () => {
      const id = await novoCliente(`Invisível ${letras}`);
      const nota = await executora
        .from("notes")
        .insert({ organization_id: orgExecutora, person_id: id, body: "Nota da executora" })
        .select("id")
        .single();
      expect(nota.error).toBeNull();
      const cobranca = await executora
        .from("receivables")
        .insert({
          organization_id: orgExecutora,
          person_id: id,
          title: "Cobrança do parceiro",
          amount: 1500,
          currency: "USD",
        })
        .select("id")
        .single();
      expect(cobranca.error).toBeNull();

      for (const conta of [parceiro, staff]) {
        expect((await conta.from("people").select("id").eq("id", id)).data).toEqual([]);
        expect((await conta.from("notes").select("id").eq("person_id", id)).data).toEqual([]);
        expect((await conta.from("receivables").select("id").eq("person_id", id)).data).toEqual([]);
        const { data: busca } = await conta.rpc("buscar_clientes", { p_busca: `Invisível ${letras}` });
        expect(busca).toEqual([]);
      }
    });

    it("a cobrança à mão em US$ com duas parcelas nasce como qualquer outra", async () => {
      const id = await novoCliente(`Cobrado ${letras}`);
      const { data: cobranca, error } = await executora
        .from("receivables")
        .insert({
          organization_id: orgExecutora,
          person_id: id,
          title: "Montagem do processo",
          amount: 3000,
          currency: "USD",
        })
        .select("id")
        .single();
      expect(error).toBeNull();

      const parcelas = await executora.from("installments").insert(
        [1, 2].map((n) => ({
          organization_id: orgExecutora,
          receivable_id: cobranca!.id,
          number: n,
          amount: 1500,
          due_on: n === 1 ? "2026-12-10" : "2027-01-10",
          method: "pix" as const,
        })),
      );
      expect(parcelas.error).toBeNull();
    });
  });

  describe("o contato é lido do parceiro", () => {
    it("buscar_clientes traz o contato do parceiro e acha pelo nome dele", async () => {
      const id = await novoCliente(`Buscado ${letras}`);
      const { data: parceira } = await executora
        .from("organizations")
        .select("name, email, phone_country_code, phone")
        .eq("id", orgParceiro)
        .single();

      const { data, error } = await executora.rpc("buscar_clientes", { p_busca: "Parceiro de Teste" });
      expect(error).toBeNull();
      const linha = data!.find((c) => c.id === id);
      expect(linha).toMatchObject({
        email: null,
        phone: null,
        partner_organization_id: orgParceiro,
        parceiro_nome: parceira!.name,
        parceiro_email: parceira!.email,
        parceiro_ddi: parceira!.phone_country_code,
        parceiro_telefone: parceira!.phone,
      });

      const curinga = await executora.rpc("buscar_clientes", { p_busca: "Parceiro%Teste" });
      expect(curinga.data!.some((c) => c.id === id)).toBe(false);
    });

    it("editar o parceiro muda o contato de todos os clientes dele, sem cópia", async () => {
      await novoCliente(`Telefone ${letras}`);
      const { data: antes } = await parceiro
        .from("organizations")
        .select("phone")
        .eq("id", orgParceiro)
        .single();
      try {
        const troca = await parceiro
          .from("organizations")
          .update({ phone: "11988887777" })
          .eq("id", orgParceiro);
        expect(troca.error).toBeNull();

        const { data } = await executora.rpc("buscar_clientes", { p_busca: `Telefone ${letras}` });
        expect(data).toHaveLength(1);
        expect(data![0].parceiro_telefone).toBe("11988887777");
        expect(data![0].phone).toBeNull();
      } finally {
        await parceiro.from("organizations").update({ phone: antes!.phone }).eq("id", orgParceiro);
      }
    });

    it("um contato novo com o e-mail do parceiro não acusa os clientes dele", async () => {
      await novoCliente(`Sem parecido ${letras}`);
      const { data: parceira } = await executora
        .from("organizations")
        .select("email, phone_country_code, phone")
        .eq("id", orgParceiro)
        .single();

      const { data, error } = await executora.rpc("contatos_parecidos", {
        p_email: parceira!.email!,
        p_ddi: parceira!.phone_country_code!,
        p_telefone: parceira!.phone!,
      });
      expect(error).toBeNull();
      expect(data!.filter((c) => criadas.includes(c.id))).toEqual([]);
    });
  });
});
