// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { entrarComo, type Cliente } from "./clientes";

/**
 * Papel decide; associação não basta (G1 e G2 da revisão de novembro).
 *
 * Até a 0036, ser membro da organização raiz bastava para tudo o que era
 * "da raiz": promover a si mesmo a dono, entrar na organização de um
 * parceiro, criar organização, apagar contato de vez. E qualquer membro podia
 * trocar a organização de um contato — plantá-lo na carteira de outra
 * empresa, ou tomá-lo de um parceiro.
 *
 * **Cada teste foi escrito para não estragar nada enquanto ainda falha.**
 * Antes da correção estas escritas passavam; por isso nenhuma promove alguém
 * de verdade (a alteração do próprio papel grava o mesmo papel), a
 * organização "criada" colide com a raiz única, e o contato que o
 * colaborador tenta apagar é o dele mesmo, de teste, já na lixeira.
 */

function recusou(resposta: { data: unknown[] | null; error: { code?: string } | null }) {
  if (resposta.error) return resposta.error.code === "42501";
  return (resposta.data ?? []).length === 0;
}

/**
 * Um contato da Duli que é só do teste, na lixeira, com nome que diz o que é.
 *
 * Contato nunca é apagado de vez (spec §6.8) — então o teste não pode criar
 * um a cada execução. Ele reaproveita sempre o mesmo, e só o recria se a
 * versão antiga da policy o tiver apagado.
 */
const CONTATO_PERMANENTE = "Teste de segurança — não apagar";

describe("o papel decide, não a associação", () => {
  let staff: Cliente;
  let parceiro: Cliente;
  let staffId: string;
  let parceiroId: string;
  let duliId: string;
  let parceiraId: string;
  let permanenteId: string;
  let contatoDoParceiro: string | null = null;

  beforeAll(async () => {
    staff = await entrarComo("colaborador");
    parceiro = await entrarComo("parceiro");

    staffId = (await staff.auth.getUser()).data.user!.id;
    parceiroId = (await parceiro.auth.getUser()).data.user!.id;

    // Pelo slug, e não "a primeira associação": quem é da raiz enxerga as
    // associações de todo mundo, e `.limit(1)` pegaria a de outra empresa.
    const { data: orgs, error } = await staff
      .from("organizations")
      .select("id, slug")
      .in("slug", ["duli", "parceiro-teste"]);
    if (error) throw new Error(error.message);
    duliId = orgs!.find((o) => o.slug === "duli")!.id;
    parceiraId = orgs!.find((o) => o.slug === "parceiro-teste")!.id;

    const { data: existente } = await staff
      .from("people")
      .select("id")
      .eq("organization_id", duliId)
      .eq("full_name", CONTATO_PERMANENTE)
      .maybeSingle();

    if (existente) {
      permanenteId = existente.id;
    } else {
      const { data: novo, error: erro } = await staff
        .from("people")
        .insert({
          organization_id: duliId,
          full_name: CONTATO_PERMANENTE,
          deleted_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (erro) throw new Error(erro.message);
      permanenteId = novo.id;
    }
  }, 30_000);

  afterAll(async () => {
    // Se a versão antiga deixou o colaborador entrar na parceira, sai.
    await staff
      .from("organization_members")
      .delete()
      .eq("organization_id", parceiraId)
      .eq("user_id", staffId);
    if (contatoDoParceiro) {
      await parceiro.from("people").delete().eq("id", contatoDoParceiro);
    }
  });

  describe("G1 — colaborador da raiz", () => {
    it("não altera a própria associação", async () => {
      const resposta = await staff
        .from("organization_members")
        .update({ role: "staff" })
        .eq("organization_id", duliId)
        .eq("user_id", staffId)
        .select("user_id");
      expect(recusou(resposta)).toBe(true);
    });

    it("não entra na organização de um parceiro", async () => {
      const resposta = await staff
        .from("organization_members")
        .insert({ organization_id: parceiraId, user_id: staffId, role: "staff" })
        .select("user_id");
      expect(recusou(resposta)).toBe(true);
    });

    it("não cria organização", async () => {
      // Tipo `root`: se a policy deixasse passar, o índice da raiz única
      // recusaria (23505) — e nenhuma organização de lixo fica para trás.
      const resposta = await staff
        .from("organizations")
        .insert({ name: "Organização do colaborador", slug: "do-colaborador", type: "root" })
        .select("id");
      expect(resposta.error?.code).toBe("42501");
    });

    it("não altera a organização de um parceiro", async () => {
      const { data: atual } = await staff
        .from("organizations")
        .select("name")
        .eq("id", parceiraId)
        .single();
      const resposta = await staff
        .from("organizations")
        .update({ name: atual!.name })
        .eq("id", parceiraId)
        .select("id");
      expect(recusou(resposta)).toBe(true);
    });

    it("não apaga contato de vez", async () => {
      const resposta = await staff.from("people").delete().eq("id", permanenteId).select("id");
      expect(recusou(resposta)).toBe(true);
    });
  });

  describe("G1 — dono de parceiro", () => {
    it("não altera a própria associação", async () => {
      const resposta = await parceiro
        .from("organization_members")
        .update({ role: "owner" })
        .eq("organization_id", parceiraId)
        .eq("user_id", parceiroId)
        .select("user_id");
      expect(recusou(resposta)).toBe(true);
    });

    it("continua apagando contato da organização de teste — é o que limpa os testes", async () => {
      const { data, error } = await parceiro
        .from("people")
        .insert({ organization_id: parceiraId, full_name: "Contato que o teste apaga" })
        .select("id")
        .single();
      expect(error).toBeNull();

      const resposta = await parceiro.from("people").delete().eq("id", data!.id).select("id");
      expect(resposta.error).toBeNull();
      expect(resposta.data).toHaveLength(1);
    });
  });

  describe("G2 — a organização de um contato não muda", () => {
    it("colaborador não atribui contato da Duli a um parceiro", async () => {
      const resposta = await staff
        .from("people")
        .update({ assigned_organization_id: parceiraId })
        .eq("id", permanenteId)
        .select("id");
      expect(recusou(resposta)).toBe(true);
    });

    it("a organização atribuída não toma o contato para si", async () => {
      // Se o passo anterior tiver passado (versão antiga), o parceiro já
      // enxerga o contato; aqui tenta levá-lo.
      const resposta = await parceiro
        .from("people")
        .update({ organization_id: parceiraId })
        .eq("id", permanenteId)
        .select("id");
      expect(recusou(resposta)).toBe(true);
    });

    it("o dono não muda a organização do próprio contato, nem sem histórico", async () => {
      const { data } = await parceiro
        .from("people")
        .insert({ organization_id: parceiraId, full_name: "Contato que tenta mudar de casa" })
        .select("id")
        .single();
      contatoDoParceiro = data!.id;

      const resposta = await parceiro
        .from("people")
        .update({ organization_id: duliId })
        .eq("id", contatoDoParceiro)
        .select("id");
      expect(recusou(resposta)).toBe(true);
    });
  });
});
