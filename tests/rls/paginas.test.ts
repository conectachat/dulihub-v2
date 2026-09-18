// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { entrarComo, fixture, type Cliente } from "./clientes";

/**
 * Observações do processo: a página, os pedaços de edição, o canal em tempo
 * real e os arquivos colados nela.
 *
 * O texto das observações é o que há de mais sensível no app — estratégia do
 * caso, nomes de quem assina carta. O tempo real abre uma porta que as outras
 * tabelas não têm: um canal onde as mudanças passam **antes** de chegar ao
 * banco. Por isso o canal também é testado, e não só as tabelas.
 */

/** Pedaço de edição de mentira: o banco guarda bytes, não entende Yjs. */
const BYTES = "\\x0102030405";

type Mensagem = { event: string; payload: unknown };

/**
 * Assina um canal e espera o resultado da assinatura.
 * Resolve com o status final: `SUBSCRIBED`, `CHANNEL_ERROR` ou `TIMED_OUT`.
 */
function assinar(
  cliente: Cliente,
  topico: string,
  privado: boolean,
  recebidas: Mensagem[] = [],
) {
  const canal = cliente.channel(topico, {
    config: { private: privado, broadcast: { self: false } },
  });
  canal.on("broadcast", { event: "*" }, (m) =>
    recebidas.push({ event: m.event, payload: m.payload }),
  );
  const status = new Promise<string>((resolve) => {
    canal.subscribe((s) => {
      if (s !== "CLOSED") resolve(s);
    });
    setTimeout(() => resolve("TIMED_OUT"), 10_000);
  });
  return { canal, status };
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("observações do processo", () => {
  let parceiro: Cliente;
  let duli: Cliente;
  let orgParceiro: string;
  let processoId: string;
  let paginaId: string;
  const arquivos: string[] = [];

  beforeAll(async () => {
    parceiro = await entrarComo("parceiro");
    duli = await entrarComo("colaborador");
    const pessoa = await fixture(parceiro);
    orgParceiro = pessoa.organization_id;

    const { data: visto } = await parceiro
      .from("visa_types")
      .select("id")
      .eq("name", "Visto do Parceiro")
      .single();
    const { data, error } = await parceiro.rpc("criar_processo", {
      p_person: pessoa.id,
      p_visa_type: visto!.id,
      p_title: "Processo das observações",
    });
    if (error) throw new Error(`criar_processo falhou: ${error.message}`);
    processoId = data;

    const pagina = await parceiro
      .from("project_pages")
      .insert({ organization_id: orgParceiro, project_id: processoId, kind: "notes" })
      .select("id")
      .single();
    if (pagina.error) throw new Error(`Página não criada: ${pagina.error.message}`);
    paginaId = pagina.data.id;
  }, 60_000);

  afterAll(async () => {
    if (arquivos.length) await parceiro.storage.from("observacoes").remove(arquivos);
    // Cascade leva página e pedaços junto.
    if (processoId) await parceiro.from("projects").delete().eq("id", processoId);
    await parceiro.removeAllChannels();
    await duli.removeAllChannels();
  });

  it("uma página por processo e tipo", async () => {
    const { error } = await parceiro
      .from("project_pages")
      .insert({ organization_id: orgParceiro, project_id: processoId, kind: "notes" });
    expect(error?.code).toBe("23505");
  });

  it("a organização dona grava e lê os pedaços de edição", async () => {
    const gravou = await parceiro
      .from("project_page_updates")
      .insert({ organization_id: orgParceiro, page_id: paginaId, update: BYTES })
      .select("id");
    expect(gravou.error).toBeNull();

    const { data } = await parceiro
      .from("project_page_updates")
      .select("update")
      .eq("page_id", paginaId);
    expect(data).toEqual([{ update: BYTES }]);
  });

  it("pedaço gravado não se reescreve nem se apaga direto", async () => {
    // Só a compactação apaga, e em transação com o snapshot: apagar solto
    // perderia texto que ainda não está em snapshot nenhum.
    const alterou = await parceiro
      .from("project_page_updates")
      .update({ update: "\\x09" })
      .eq("page_id", paginaId)
      .select("id");
    expect(alterou.data ?? []).toEqual([]);

    const apagou = await parceiro
      .from("project_page_updates")
      .delete()
      .eq("page_id", paginaId)
      .select("id");
    expect(apagou.data ?? []).toEqual([]);
  });

  it("a Duli não lê a página nem os pedaços do parceiro", async () => {
    const pagina = await duli.from("project_pages").select("id").eq("id", paginaId);
    const pedacos = await duli
      .from("project_page_updates")
      .select("id")
      .eq("page_id", paginaId);
    expect(pagina.data).toEqual([]);
    expect(pedacos.data).toEqual([]);
  });

  it("a Duli não escreve na página do parceiro", async () => {
    const { error } = await duli
      .from("project_page_updates")
      .insert({ organization_id: orgParceiro, page_id: paginaId, update: BYTES });
    expect(error?.code).toBe("42501");
  });

  it("compactar grava o snapshot e apaga só os pedaços incluídos", async () => {
    const { data: ultimo } = await parceiro
      .from("project_page_updates")
      .select("id")
      .eq("page_id", paginaId)
      .order("id", { ascending: false })
      .limit(1)
      .single();
    // Um pedaço que chega depois do corte fica.
    await parceiro
      .from("project_page_updates")
      .insert({ organization_id: orgParceiro, page_id: paginaId, update: "\\x0a0b" });

    const { error } = await parceiro.rpc("compactar_pagina", {
      p_page: paginaId,
      p_snapshot: "\\x0f0f",
      p_ate: ultimo!.id,
      p_content: [{ type: "p", children: [{ text: "oi" }] }],
    });
    expect(error).toBeNull();

    const { data: pagina } = await parceiro
      .from("project_pages")
      .select("snapshot, content")
      .eq("id", paginaId)
      .single();
    expect(pagina!.snapshot).toBe("\\x0f0f");
    const { data: restantes } = await parceiro
      .from("project_page_updates")
      .select("update")
      .eq("page_id", paginaId);
    expect(restantes).toEqual([{ update: "\\x0a0b" }]);
  });

  it("a Duli não compacta a página do parceiro", async () => {
    const { error } = await duli.rpc("compactar_pagina", {
      p_page: paginaId,
      p_snapshot: "\\x00",
      p_ate: 9_999_999_999,
      p_content: [],
    });
    expect(error).not.toBeNull();
    const { data } = await parceiro
      .from("project_page_updates")
      .select("id")
      .eq("page_id", paginaId);
    expect(data!.length).toBeGreaterThan(0);
  });

  describe("arquivos colados na página", () => {
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

    it("o parceiro sobe, a Duli não baixa", async () => {
      const caminho = `${orgParceiro}/${processoId}/${crypto.randomUUID()}-foto.png`;
      const subiu = await parceiro.storage.from("observacoes").upload(caminho, png);
      expect(subiu.error).toBeNull();
      arquivos.push(caminho);

      const { data } = await duli.storage.from("observacoes").download(caminho);
      expect(data).toBeNull();
    });

    it("ninguém sobe no espaço de outra organização", async () => {
      const { data: org } = await duli
        .from("organization_members")
        .select("organization_id")
        .limit(1)
        .single();
      const { error } = await parceiro.storage
        .from("observacoes")
        .upload(`${org!.organization_id}/x/${crypto.randomUUID()}-a.png`, png);
      expect(error).not.toBeNull();
    });
  });

  describe("canal em tempo real", () => {
    it("quem é da organização entra no canal privado da página", async () => {
      const { status } = assinar(parceiro, `pagina:${paginaId}`, true);
      expect(await status).toBe("SUBSCRIBED");
    }, 20_000);

    it("a Duli não entra no canal privado do parceiro", async () => {
      const { status } = assinar(duli, `pagina:${paginaId}`, true);
      expect(await status).toBe("CHANNEL_ERROR");
    }, 20_000);

    it("canal público de mesmo nome não escuta o privado", async () => {
      // A dúvida que a documentação não responde: um canal público com o
      // mesmo tópico recebe o que passa no privado? Se receber, a separação
      // depende de desligar "Allow public access" no painel do Supabase.
      //
      // Sessões novas: `channel()` devolve o canal já aberto com o mesmo
      // tópico, e o das provas anteriores está recusado ou assinado.
      const [outraDuli, outroParceiro] = await Promise.all([
        entrarComo("colaborador"),
        entrarComo("parceiro"),
      ]);
      const escutadas: Mensagem[] = [];
      const intruso = assinar(outraDuli, `pagina:${paginaId}`, false, escutadas);
      expect(await intruso.status).toBe("SUBSCRIBED");

      const dono = assinar(outroParceiro, `pagina:${paginaId}`, true);
      expect(await dono.status).toBe("SUBSCRIBED");
      await dono.canal.send({
        type: "broadcast",
        event: "update",
        payload: { segredo: "estratégia do caso" },
      });
      await esperar(2_000);

      expect(escutadas).toEqual([]);
      await outraDuli.removeAllChannels();
      await outroParceiro.removeAllChannels();
    }, 40_000);
  });
});
