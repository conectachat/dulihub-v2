// @vitest-environment node

import { createServerClient } from "@supabase/ssr";
import { beforeAll, describe, expect, it } from "vitest";

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

beforeAll(async () => {
  // Servidor fora do ar é falha, não pulo.
  try {
    await fetch(BASE, { redirect: "manual" });
  } catch {
    throw new Error(
      `Nenhum servidor em ${BASE}. Suba com \`bun run dev\` antes de rodar a fumaça.`,
    );
  }

  // Mesmo cliente que o app usa no servidor, com uma jarra de cookies em
  // memória: sai daqui exatamente o que o navegador guardaria.
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
    email: EMAILS.colaborador,
    password: obrigatorio(SENHAS.colaborador),
  });
  if (error) throw new Error(`Login da fumaça falhou: ${error.message}`);

  cookie = [...jarra].map(([nome, valor]) => `${nome}=${valor}`).join("; ");

  // Uma ficha e um visto reais: as telas de detalhe têm caminho de código
  // próprio, e são as que mais carregam junção.
  const [{ data: pessoa }, { data: visto }] = await Promise.all([
    supabase.from("people").select("id").is("deleted_at", null).limit(1).maybeSingle(),
    supabase.from("visa_types").select("id").limit(1).maybeSingle(),
  ]);
  pessoaId = pessoa?.id ?? null;
  vistoId = visto?.id ?? null;
}, 60_000);

const pedir = (rota: string, comSessao = true) =>
  fetch(`${BASE}${rota}`, {
    headers: comSessao ? { cookie } : {},
    redirect: "manual",
  });

const TOPO = [
  "/",
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

  it("detalhe de tipo de visto", async () => {
    expect(vistoId, "nenhum tipo de visto visível para a conta de teste").not.toBeNull();
    const resposta = await pedir(`/configuracoes/tipos-de-visto?visa=${vistoId}`);
    expect(resposta.status).toBe(200);
  }, 60_000);
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
