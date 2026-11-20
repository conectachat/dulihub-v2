// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

import { entrarComo, fixture, type Cliente } from "./clientes";

/**
 * Novo cliente (0055; CLI-15) e o dono no "Marcar como cliente" (CLI-12).
 *
 * `criar_cliente` torna cliente, numa gravação só, um contato existente da
 * organização atual que não está no funil, ou um contato novo — só para a
 * gestão. Quem cria fica como dono, se a pessoa não tiver. A busca do diálogo
 * (`buscar_contatos_para_cliente`) traz só quem ainda pode virar cliente.
 *
 * Tudo em pessoas descartáveis da organização de teste, apagadas no fim (a
 * cascata leva negócio e histórico).
 */

const s = crypto.randomUUID().replace(/\D/g, "").slice(0, 8).padEnd(8, "0");
// Só letras: a busca por dígitos também olha nome e e-mail.
const letras = s.replace(/\d/g, (d) => "abcdefghij"[Number(d)]);
const f = crypto.randomUUID().replace(/\D/g, "").slice(0, 8).padEnd(8, "0");

const MSG = {
  gestao: "Só a gestão marca alguém como cliente.",
  funil: "Este contato está no funil: use o Ganho.",
  jaCliente: "Já é cliente.",
  lixeira: "Este contato está na lixeira. Restaure antes.",
  naoEncontrado: "Contato não encontrado.",
  umDosDois: "Escolha um contato ou preencha um novo",
};

/** Hoje no fuso de São Paulo, como o banco calcula. */
function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** O jsonb de `criar_cliente`, lido por esquema — nunca por `as`. */
const respostaSchema = z.discriminatedUnion("situacao", [
  z.object({ situacao: z.literal("criado"), pessoa: z.string() }),
  z.object({
    situacao: z.literal("precisa_confirmar"),
    parecidos: z.array(z.object({ id: z.string(), outra_organizacao: z.boolean() })),
  }),
]);
type Resposta = z.infer<typeof respostaSchema>;
type Args = Partial<Database["public"]["Functions"]["criar_cliente"]["Args"]>;

describe("Novo cliente (0055)", () => {
  let parceiro: Cliente;
  let staff: Cliente;
  let duli: Cliente;
  let parceiroId: string;
  let staffId: string;
  let org: string;
  let orgDuli: string;
  let funilId: string;
  let abertaId: string;
  let perdidoId: string;
  const criadas: string[] = [];
  let contador = 0;

  async function novaPessoa(extra: Record<string, unknown> = {}): Promise<string> {
    contador += 1;
    const { data, error } = await parceiro
      .from("people")
      .insert({
        organization_id: org,
        full_name: `Novo cliente ${letras} ${contador}`,
        email: `novo.cliente.${s}.${contador}@teste.dulihub`,
        phone_country_code: "+55",
        phone: `31${String(contador).padStart(3, "0")}${s}`,
        lifecycle_stage: "opportunity",
        ...extra,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Pessoa descartável não criada: ${error.message}`);
    criadas.push(data.id);
    return data.id;
  }

  async function novoNegocio(pessoaId: string): Promise<string> {
    const { data, error } = await parceiro
      .from("opportunities")
      .insert({
        organization_id: org,
        person_id: pessoaId,
        pipeline_id: funilId,
        stage_id: abertaId,
        title: `Negócio ${s}`,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Negócio não criado: ${error.message}`);
    return data.id;
  }

  async function criar(quem: Cliente, args: Args) {
    const { data, error } = await quem.rpc("criar_cliente", { p_organizacao: org, ...args });
    return { data: data === null ? null : respostaSchema.parse(data), error };
  }

  function guardar(data: Resposta | null) {
    if (data?.situacao === "criado") criadas.push(data.pessoa);
  }

  async function pessoa(id: string) {
    const { data, error } = await parceiro
      .from("people")
      .select("lifecycle_stage, client_since, owner_id")
      .eq("id", id)
      .single();
    if (error) throw new Error(`Pessoa ilegível: ${error.message}`);
    return data;
  }

  async function marcados(id: string) {
    const { data, error } = await parceiro
      .from("activities")
      .select("description")
      .eq("person_id", id)
      .eq("type", "virou_cliente");
    if (error) throw new Error(`Histórico ilegível: ${error.message}`);
    return data.map((a) => a.description);
  }

  const contatoNovo = (rotulo: string, extra: Record<string, string> = {}): Record<string, string> => ({
    full_name: `Novo cliente ${letras} ${rotulo}`,
    email: `${rotulo}.${s}@teste.dulihub`,
    phone_country_code: "55",
    phone: `319${s}`,
    ...extra,
  });

  beforeAll(async () => {
    [parceiro, staff, duli] = await Promise.all([
      entrarComo("parceiro"),
      entrarComo("staff"),
      entrarComo("colaborador"),
    ]);
    parceiroId = (await parceiro.auth.getUser()).data.user!.id;
    staffId = (await staff.auth.getUser()).data.user!.id;
    org = (await fixture(parceiro)).organization_id;

    const { data: daDuli, error: erroDuli } = await duli
      .from("organizations")
      .select("id")
      .eq("slug", "duli")
      .single();
    if (erroDuli) throw new Error(`Duli ilegível: ${erroDuli.message}`);
    orgDuli = daDuli.id;

    const { data: funil, error: erroFunil } = await parceiro
      .from("pipelines")
      .select("id")
      .eq("organization_id", org)
      .eq("is_default", true)
      .single();
    if (erroFunil) throw new Error(`Funil ilegível: ${erroFunil.message}`);
    funilId = funil.id;

    const { data: etapas, error: erroEtapas } = await parceiro
      .from("pipeline_stages")
      .select("id, is_won, is_lost, position")
      .eq("pipeline_id", funilId);
    if (erroEtapas) throw new Error(`Etapas ilegíveis: ${erroEtapas.message}`);
    abertaId = etapas
      .filter((e) => !e.is_won && !e.is_lost)
      .sort((a, b) => a.position - b.position)[0]!.id;
    perdidoId = etapas.find((e) => e.is_lost)!.id;
  }, 60_000);

  afterAll(async () => {
    if (criadas.length) await parceiro.from("people").delete().in("id", criadas);
  });

  describe("só a gestão", () => {
    it("o staff não cria cliente novo, e nada nasce", async () => {
      const novo = contatoNovo("do-staff");
      const { data, error } = await criar(staff, { p_novo_contato: novo });
      guardar(data);

      expect(error?.code).toBe("P0001");
      expect(error?.message).toBe(MSG.gestao);
      const { data: achados } = await parceiro.from("people").select("id").eq("email", novo.email);
      expect(achados).toEqual([]);
    });

    it("o staff não torna cliente um contato existente", async () => {
      const p = await novaPessoa();
      const { error } = await criar(staff, { p_contato: p });

      expect(error?.message).toBe(MSG.gestao);
      expect((await pessoa(p)).lifecycle_stage).toBe("opportunity");
    });

    it("a organização de quem não é gestão é recusada", async () => {
      const { data, error } = await criar(parceiro, {
        p_organizacao: orgDuli,
        p_novo_contato: contatoNovo("na-duli"),
      });
      guardar(data);
      expect(error?.message).toBe(MSG.gestao);
    });
  });

  describe("contato existente", () => {
    it("vira cliente hoje, com quem criou como dono e o histórico; dois cliques, uma gravação", async () => {
      const p = await novaPessoa();

      const [a, b] = await Promise.all([
        criar(parceiro, { p_contato: p }),
        criar(parceiro, { p_contato: p }),
      ]);
      const erros = [a.error, b.error].filter(Boolean);
      expect(erros).toHaveLength(1);
      expect(erros[0]!.message).toBe(MSG.jaCliente);
      expect([a.data, b.data].filter(Boolean)).toEqual([{ situacao: "criado", pessoa: p }]);

      expect(await pessoa(p)).toEqual({
        lifecycle_stage: "client",
        client_since: hojeEmSaoPaulo(),
        owner_id: parceiroId,
      });
      expect(await marcados(p)).toEqual(["Marcado como cliente"]);
    });

    it("quem já tem dono continua com o dono dele", async () => {
      const p = await novaPessoa({ owner_id: staffId });
      const { error } = await criar(parceiro, { p_contato: p });

      expect(error).toBeNull();
      expect((await pessoa(p)).owner_id).toBe(staffId);
    });

    it("quem está no funil fica de fora; negócio perdido não impede", async () => {
      const noFunil = await novaPessoa();
      await novoNegocio(noFunil);
      const recusado = await criar(parceiro, { p_contato: noFunil });
      expect(recusado.error?.message).toBe(MSG.funil);
      expect((await pessoa(noFunil)).lifecycle_stage).toBe("opportunity");

      const perdeu = await novaPessoa();
      const negocio = await novoNegocio(perdeu);
      const perdido = await parceiro
        .from("opportunities")
        .update({ status: "lost", stage_id: perdidoId, closed_at: new Date().toISOString() })
        .eq("id", negocio);
      expect(perdido.error).toBeNull();
      const aceito = await criar(parceiro, { p_contato: perdeu });
      expect(aceito.error).toBeNull();
      expect((await pessoa(perdeu)).lifecycle_stage).toBe("client");
    });

    it("lixeira, já cliente, inexistente e os dois juntos são recusados", async () => {
      const naLixeira = await novaPessoa({ deleted_at: new Date().toISOString() });
      const cliente = await novaPessoa({ lifecycle_stage: "client" });

      const casos: [Args, string][] = [
        [{ p_contato: naLixeira }, MSG.lixeira],
        [{ p_contato: cliente }, MSG.jaCliente],
        [{ p_contato: crypto.randomUUID() }, MSG.naoEncontrado],
        [{ p_contato: cliente, p_novo_contato: contatoNovo("junto") }, MSG.umDosDois],
        [{}, MSG.umDosDois],
      ];
      for (const [args, frase] of casos) {
        const { data, error } = await criar(parceiro, args);
        guardar(data);
        expect(error?.code).toBe("P0001");
        expect(error?.message).toBe(frase);
      }
    });
  });

  describe("contato novo", () => {
    it("nasce cliente na organização atual, com quem criou como dono e o histórico", async () => {
      const { data, error } = await criar(parceiro, { p_novo_contato: contatoNovo("novo") });
      guardar(data);

      expect(error).toBeNull();
      if (data?.situacao !== "criado") throw new Error("Contato novo não criado.");
      const id = data.pessoa;
      const { data: linha } = await parceiro
        .from("people")
        .select("organization_id, lifecycle_stage, client_since, owner_id, phone_country_code")
        .eq("id", id)
        .single();
      expect(linha).toEqual({
        organization_id: org,
        lifecycle_stage: "client",
        client_since: hojeEmSaoPaulo(),
        owner_id: parceiroId,
        phone_country_code: "+55",
      });
      expect(await marcados(id)).toEqual(["Marcado como cliente"]);
    });

    it("e-mail inválido recebe a frase do contato, e nada nasce", async () => {
      const novo = contatoNovo("invalido", { email: "sem-arroba" });
      const { data, error } = await criar(parceiro, { p_novo_contato: novo });
      guardar(data);

      expect(error?.message).toBe("E-mail inválido");
      const { data: achados } = await parceiro
        .from("people")
        .select("id")
        .eq("full_name", novo.full_name);
      expect(achados).toEqual([]);
    });

    it("parecido pede confirmação sem gravar; confirmado, nasce", async () => {
      const existente = await novaPessoa();
      const { data: comEmail } = await parceiro
        .from("people")
        .select("email")
        .eq("id", existente)
        .single();
      const novo = contatoNovo("parecido", { email: comEmail!.email!, phone: `318${f}` });

      const primeira = await criar(parceiro, { p_novo_contato: novo });
      guardar(primeira.data);
      expect(primeira.error).toBeNull();
      if (primeira.data?.situacao !== "precisa_confirmar") throw new Error("Não pediu confirmação.");
      expect(primeira.data.parecidos).toContainEqual(expect.objectContaining({ id: existente, outra_organizacao: false }));
      const { data: antes } = await parceiro.from("people").select("id").eq("full_name", novo.full_name);
      expect(antes).toEqual([]);

      const confirmada = await criar(parceiro, {
        p_novo_contato: novo,
        p_confirmar_contato_parecido: true,
      });
      guardar(confirmada.data);
      expect(confirmada.error).toBeNull();
      expect(confirmada.data?.situacao).toBe("criado");
    });
  });

  it("contato atribuído por outra organização não vira cliente lá (só a organização atual)", async () => {
    const { data: atribuido, error } = await parceiro
      .from("people")
      .insert({
        organization_id: org,
        assigned_organization_id: orgDuli,
        full_name: `Atribuido ${letras}`,
        lifecycle_stage: "contact",
      })
      .select("id")
      .single();
    if (error) throw new Error(`Atribuído não criado: ${error.message}`);

    try {
      const visivel = await duli.from("people").select("id").eq("id", atribuido.id);
      expect(visivel.data).toHaveLength(1);

      const busca = await duli.rpc("buscar_contatos_para_cliente", {
        p_organizacao: orgDuli,
        p_busca: `Atribuido ${letras}`,
      });
      expect(busca.error).toBeNull();
      expect(busca.data).toEqual([]);

      const recusado = await criar(duli, { p_organizacao: orgDuli, p_contato: atribuido.id });
      expect(recusado.error?.message).toBe(MSG.gestao);
      expect((await pessoa(atribuido.id)).lifecycle_stage).toBe("contact");
    } finally {
      await parceiro.from("people").delete().eq("id", atribuido.id);
    }
  });

  describe("buscar_contatos_para_cliente", () => {
    const ids: Record<"alfa" | "beta" | "gama", string> = { alfa: "", beta: "", gama: "" };
    const nome = (n: string) => `Busca ${letras} ${n}`;

    const busca = async (termo: string, limite?: number) => {
      const { data, error } = await parceiro.rpc("buscar_contatos_para_cliente", {
        p_organizacao: org,
        p_busca: termo,
        ...(limite === undefined ? {} : { p_limite: limite }),
      });
      if (error) throw new Error(`buscar_contatos_para_cliente("${termo}"): ${error.message}`);
      return data ?? [];
    };

    beforeAll(async () => {
      ids.alfa = await novaPessoa({
        full_name: nome("Alfa"),
        email: `alfa.${s}@exemplo-${letras}.dulihub`,
        phone: `(31) 9${f.slice(0, 4)}-${f.slice(4)}`,
      });
      ids.beta = await novaPessoa({ full_name: nome("Beta"), lifecycle_stage: "contact" });
      ids.gama = await novaPessoa({ full_name: nome("Gama") });
      await novaPessoa({ full_name: nome("Cliente"), lifecycle_stage: "client" });
      await novaPessoa({ full_name: nome("Lixeira"), deleted_at: new Date().toISOString() });
      await novoNegocio(await novaPessoa({ full_name: nome("Funil") }));
    }, 60_000);

    it("acha por parte do nome, só quem pode virar cliente, em ordem de nome", async () => {
      const linhas = await busca(`Busca ${letras}`);
      expect(linhas.map((l) => l.id)).toEqual([ids.alfa, ids.beta, ids.gama]);
      expect(linhas.every((l) => Number(l.total) === 3)).toBe(true);
    });

    it("acha pelo domínio do e-mail e pelo telefone com máscara e DDI", async () => {
      expect((await busca(`@exemplo-${letras}`)).map((l) => l.id)).toEqual([ids.alfa]);
      expect((await busca(`+55 (31) 9${f}`)).map((l) => l.id)).toEqual([ids.alfa]);
    });

    it("o limite corta as linhas, não o total", async () => {
      const linhas = await busca(`Busca ${letras}`, 2);
      expect(linhas).toHaveLength(2);
      expect(Number(linhas[0]!.total)).toBe(3);
    });

    it("% e _ são literais", async () => {
      expect(await busca(`Busca ${letras}%`)).toEqual([]);
      expect(await busca(`Busca_${letras}`)).toEqual([]);
    });
  });
});
