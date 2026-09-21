// @vitest-environment node

import { createServerClient } from "@supabase/ssr";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ALL_SECTIONS } from "@/features/settings/sections";

import { EMAILS, obrigatorio, SENHAS } from "../contas";

/**
 * Cada tela principal abre, com sessão de verdade.
 *
 * Existe por causa de 18/set/2026: `/contatos` ficou fora do ar em produção
 * desde a Etapa 2 e ninguém viu. Tipos, lint, build e 110 testes passavam — o
 * erro (um ícone passado como função do servidor para o cliente) só existe na
 * hora em que a página é desenhada, e nada desenhava a página com login.
 *
 * Esta suíte desenha. Pede cada rota ao servidor já de pé, com os cookies de
 * uma sessão real, e exige `200`. O código HTTP é o sinal: procurar o texto da
 * tela de erro não serve, porque em desenvolvimento a tela é outra.
 *
 * Só leitura. A conta é `staff` da Duli: enxerga os dados reais e não grava
 * nada aqui.
 *
 * Precisa do servidor rodando (`bun run dev` ou `bun run start`). No CI ele é
 * construído e ligado antes deste passo.
 */

const BASE = process.env.FUMACA_URL ?? "http://localhost:3000";

let cookie = "";
let pessoaId: string | null = null;
let vistoId: string | null = null;

/**
 * Entra com uma conta de teste e devolve o cliente e o cabeçalho de cookie.
 *
 * Mesmo cliente que o app usa no servidor, com uma jarra de cookies em
 * memória: sai daqui exatamente o que o navegador guardaria.
 */
async function entrar(papel: "colaborador" | "parceiro") {
  const jarra = new Map<string, string>();
  const supabase = createServerClient(
    obrigatorio("NEXT_PUBLIC_SUPABASE_URL"),
    obrigatorio("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () => [...jarra].map(([name, value]) => ({ name, value })),
        setAll: (lista) => {
          for (const { name, value } of lista) jarra.set(name, value);
        },
      },
    },
  );

  const { error } = await supabase.auth.signInWithPassword({
    email: EMAILS[papel],
    password: obrigatorio(SENHAS[papel]),
  });
  if (error) throw new Error(`Login da fumaça (${papel}) falhou: ${error.message}`);

  return {
    supabase,
    cookie: [...jarra].map(([nome, valor]) => `${nome}=${valor}`).join("; "),
  };
}

beforeAll(async () => {
  // Servidor fora do ar é falha, não pulo.
  try {
    await fetch(BASE, { redirect: "manual" });
  } catch {
    throw new Error(
      `Nenhum servidor em ${BASE}. Suba com \`bun run dev\` antes de rodar a fumaça.`,
    );
  }

  const sessao = await entrar("colaborador");
  const supabase = sessao.supabase;
  cookie = sessao.cookie;

  // Uma ficha e um visto reais: as telas de detalhe têm caminho de código
  // próprio, e são as que mais carregam junção.
  const [pessoa, visto] = await Promise.all([
    supabase.from("people").select("id").is("deleted_at", null).limit(1).maybeSingle(),
    supabase.from("visa_types").select("id").limit(1).maybeSingle(),
  ]);
  // O erro vem antes do "não existe". Descartá-lo já escondeu a causa de uma
  // falha intermitente em 21/set: a suíte acusava "nenhum contato visível"
  // quando o problema era a leitura, não a ausência de contato.
  const falha = pessoa.error ?? visto.error;
  if (falha) throw new Error(`Fixture da fumaça ilegível: ${falha.message}`);
  pessoaId = pessoa.data?.id ?? null;
  vistoId = visto.data?.id ?? null;
}, 60_000);

const pedir = (rota: string, comSessao: boolean | string = true) =>
  fetch(`${BASE}${rota}`, {
    headers:
      comSessao === false ? {} : { cookie: comSessao === true ? cookie : comSessao },
    redirect: "manual",
  });

const TOPO = [
  "/",
  "/offline",
  "/contatos",
  "/contatos?view=excluidos",
  "/crm",
  "/projetos",
  "/financeiro",
];

// Derivado do registro: seção nova entra no teste sem ninguém lembrar.
const CONFIGURACOES = ALL_SECTIONS.map((s) => `/configuracoes/${s.slug}`);

describe("cada tela abre com sessão", () => {
  it.each([...TOPO, ...CONFIGURACOES])("%s", async (rota) => {
    const resposta = await pedir(rota);
    expect(resposta.status).toBe(200);
  }, 60_000);

  it("ficha de contato", async () => {
    expect(pessoaId, "nenhum contato visível para a conta de teste").not.toBeNull();
    const resposta = await pedir(`/contatos/${pessoaId}`);
    expect(resposta.status).toBe(200);
  }, 60_000);

  it("ficha de contato vinda do atalho do CRM", async () => {
    // Negócio que não é do contato: a ficha abre normal, sem o diálogo.
    const resposta = await pedir(
      `/contatos/${pessoaId}?novo-processo=${crypto.randomUUID()}`,
    );
    expect(resposta.status).toBe(200);
  }, 60_000);

  it("processo que não existe dá 404, não erro", async () => {
    // Desenha o caminho de código da tela do processo mesmo sem processo
    // real na conta de teste: consulta, RLS devolvendo vazio, `notFound`.
    const resposta = await pedir(`/projetos/${crypto.randomUUID()}`);
    expect(resposta.status).toBe(404);
  }, 60_000);

  it("detalhe de tipo de visto", async () => {
    expect(vistoId, "nenhum tipo de visto visível para a conta de teste").not.toBeNull();
    const resposta = await pedir(`/configuracoes/tipos-de-visto?visa=${vistoId}`);
    expect(resposta.status).toBe(200);
  }, 60_000);
});

describe("app instalável", () => {
  // Sem estas três respostas o app não instala, e o que o Estágio 2 guardar
  // no celular não sobrevive — o iPhone só preserva os dados de app que está
  // na tela de início.
  it("o manifesto abre sem sessão", async () => {
    const resposta = await pedir("/manifest.webmanifest", false);
    expect(resposta.status).toBe(200);
    const manifesto = await resposta.json();
    expect(manifesto.display).toBe("standalone");
    expect(manifesto.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
  });

  it("a tela de sem conexão abre sem sessão", async () => {
    // O service worker a entrega offline, quando não há como conferir login.
    expect((await pedir("/offline", false)).status).toBe(200);
  });

  it("o service worker nunca é guardado em cache", async () => {
    // O defeito do app antigo: `sw.js` em cache nunca se atualiza.
    const resposta = await pedir("/sw.js", false);
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("cache-control")).toContain("no-store");
  });
});

describe("sem sessão", () => {
  it("manda para o login em vez de mostrar dado", async () => {
    // Prova que o `proxy.ts` continua protegendo. Uma tela que abrisse sem
    // sessão passaria no bloco de cima do mesmo jeito.
    const resposta = await pedir("/contatos", false);
    expect([302, 303, 307, 308]).toContain(resposta.status);
    expect(resposta.headers.get("location")).toContain("/login");
  });
});

/**
 * As telas de processo com um processo de verdade.
 *
 * A conta da Duli não tem processo, e lista vazia não desenha nada do que
 * importa — barra, selo, prazo, junções. Aqui o parceiro cria um processo da
 * fixture, as telas são pedidas com a sessão dele, e o processo é apagado no
 * fim. É a única gravação da fumaça, e fica toda dentro da organização de
 * teste.
 */
describe("com um processo de verdade", () => {
  let sessao: Awaited<ReturnType<typeof entrar>>;
  let processoId: string | null = null;
  let pessoaDoParceiro: string;
  const TITULO = `Processo da fumaça ${crypto.randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    sessao = await entrar("parceiro");
    const { supabase } = sessao;

    const [{ data: pessoa }, { data: visto }] = await Promise.all([
      supabase.from("people").select("id").limit(1).single(),
      supabase.from("visa_types").select("id").eq("name", "Visto do Parceiro").single(),
    ]);
    pessoaDoParceiro = pessoa!.id;

    const { data, error } = await supabase.rpc("criar_processo", {
      p_person: pessoa!.id,
      p_visa_type: visto!.id,
      p_title: TITULO,
    });
    if (error) throw new Error(`criar_processo falhou: ${error.message}`);
    processoId = data;
  }, 60_000);

  afterAll(async () => {
    if (processoId) await sessao.supabase.from("projects").delete().eq("id", processoId);
  });

  it.each([
    ["lista", () => "/projetos"],
    ["tela do processo", () => `/projetos/${processoId}`],
    ["ficha do contato", () => `/contatos/${pessoaDoParceiro}`],
    ["CRM", () => "/crm"],
  ])("%s abre e mostra o processo", async (nome, rota) => {
    const resposta = await pedir(rota(), sessao.cookie);
    expect(resposta.status).toBe(200);
    const html = await resposta.text();
    if (nome !== "CRM") expect(html).toContain(TITULO);
    if (nome === "tela do processo") {
      // Etapas copiadas do molde e o bloco do USCIS desenhados de verdade.
      // A sub-etapa não: o grupo nasce fechado (decisão de 18/set).
      expect(html).toContain("Etapa A");
      expect(html).toContain("Data prevista");
      // A aba existe e a página de observações foi criada sem erro — o
      // editor em si é do navegador e não vem no HTML.
      expect(html).toContain("Observações");
      expect(html).toContain("Recibo (receipt number)");
    }
  }, 60_000);
});
