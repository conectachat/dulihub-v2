// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { revalidatePath } from "next/cache";

import { contextoAtual, SEM_ORGANIZACAO } from "@/lib/organizacao";
import { CAMPO_CONFIRMAR_PARECIDO } from "@/lib/parecidos";
import { revalidarPessoa } from "@/lib/revalidar";

import { buscarContatosParaCliente, criarCliente } from "./novo-cliente-actions";

/**
 * O Novo cliente (CLI-15) visto do servidor: a organização atual vai para o
 * banco, que decide quem pode; a ação só lê o formulário, pergunta o parecido
 * e leva ao perfil na aba Projetos.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((destino: string) => {
    throw new Error(`NEXT_REDIRECT ${destino}`);
  }),
}));
vi.mock("@/lib/revalidar", () => ({ revalidarPessoa: vi.fn() }));
vi.mock("@/lib/organizacao", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/organizacao")>()),
  contextoAtual: vi.fn(),
}));

const PESSOA = "11111111-1111-4111-8111-111111111111";
const VAZIO = { error: null };

let rpc: ReturnType<typeof vi.fn>;

function usar(resposta: { data: unknown; error: unknown }, organizationId: string | null = "org-1") {
  rpc = vi.fn(async () => resposta);
  vi.mocked(contextoAtual).mockResolvedValue({
    supabase: { rpc },
    userId: "u1",
    organizationId,
    papel: "owner",
    error: null,
  } as never);
}

function formulario(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

const NOVO = {
  modo_contato: "novo",
  novo_full_name: "Maria Souza",
  novo_email: "maria@exemplo.com",
  novo_phone_country_code: "55",
  novo_phone: "31 99999-0000",
};

beforeEach(() => {
  vi.clearAllMocks();
  usar({ data: { situacao: "criado", pessoa: PESSOA }, error: null });
});

describe("criarCliente", () => {
  it("sem organização, para antes do banco", async () => {
    usar({ data: null, error: null }, null);
    const r = await criarCliente(VAZIO, formulario({ modo_contato: "existente", person_id: PESSOA }));
    expect(r.error).toBe(SEM_ORGANIZACAO);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("contato existente: manda a organização atual e o contato, e leva ao perfil em Projetos", async () => {
    await expect(
      criarCliente(VAZIO, formulario({ modo_contato: "existente", person_id: PESSOA })),
    ).rejects.toThrow(`NEXT_REDIRECT /clientes/${PESSOA}?aba=projetos&novo-processo=novo`);

    expect(rpc).toHaveBeenCalledWith("criar_cliente", {
      p_organizacao: "org-1",
      p_contato: PESSOA,
      p_confirmar_contato_parecido: false,
    });
    expect(revalidarPessoa).toHaveBeenCalledWith(PESSOA);
    // O Início conta clientes.
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("contato existente sem escolha não vai ao banco", async () => {
    const r = await criarCliente(VAZIO, formulario({ modo_contato: "existente", person_id: "" }));
    expect(r.error).toBe("Escolha um contato");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("contato novo: os campos novo_* lidos no servidor, e a confirmação só pelo campo dela", async () => {
    await expect(
      criarCliente(VAZIO, formulario({ ...NOVO, [CAMPO_CONFIRMAR_PARECIDO]: "1" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(rpc).toHaveBeenCalledWith("criar_cliente", {
      p_organizacao: "org-1",
      p_novo_contato: {
        full_name: "Maria Souza",
        email: "maria@exemplo.com",
        phone_country_code: "+55",
        phone: "31 99999-0000",
      },
      p_confirmar_contato_parecido: true,
    });
  });

  it("contato novo sem nome não vai ao banco", async () => {
    const r = await criarCliente(VAZIO, formulario({ ...NOVO, novo_full_name: " " }));
    expect(r.error).toBe("Informe o nome");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("parecido: devolve a lista, com outraOrganizacao, sem ok e sem redirecionar", async () => {
    usar({
      data: {
        situacao: "precisa_confirmar",
        parecidos: [
          {
            id: "p9",
            nome: "Paula",
            estagio: "contact",
            na_lixeira: false,
            bate_email: true,
            bate_telefone: false,
            outra_organizacao: true,
          },
        ],
      },
      error: null,
    });

    const r = await criarCliente(VAZIO, formulario(NOVO));

    expect(r.error).toBeNull();
    expect(r.ok).toBeUndefined();
    expect(r.parecidos).toEqual([
      {
        id: "p9",
        nome: "Paula",
        estagio: "contact",
        naLixeira: false,
        bateEmail: true,
        bateTelefone: false,
        outraOrganizacao: true,
      },
    ]);
    expect(revalidarPessoa).not.toHaveBeenCalled();
  });

  it("a recusa do banco volta com a frase dele", async () => {
    usar({ data: null, error: { code: "P0001", message: "Este contato está no funil: use o Ganho." } });
    const r = await criarCliente(VAZIO, formulario({ modo_contato: "existente", person_id: PESSOA }));
    expect(r.error).toBe("Este contato está no funil: use o Ganho.");
  });
});

describe("buscarContatosParaCliente", () => {
  it("busca na organização atual, até 20, e devolve o total do filtro", async () => {
    usar({
      data: [
        { id: "a", full_name: "Ana", email: null, phone_country_code: null, phone: null, total: 25 },
        { id: "b", full_name: "Bia", email: "b@x.co", phone_country_code: "+55", phone: "31 9", total: 25 },
      ],
      error: null,
    });

    const r = await buscarContatosParaCliente("an");

    expect(rpc).toHaveBeenCalledWith("buscar_contatos_para_cliente", {
      p_organizacao: "org-1",
      p_busca: "an",
      p_limite: 20,
    });
    expect(r).toEqual({
      linhas: [
        { id: "a", full_name: "Ana", email: null, phone_country_code: null, phone: null },
        { id: "b", full_name: "Bia", email: "b@x.co", phone_country_code: "+55", phone: "31 9" },
      ],
      total: 25,
      error: null,
    });
  });

  it("sem resultado, total zero", async () => {
    usar({ data: [], error: null });
    expect(await buscarContatosParaCliente("zz")).toEqual({ linhas: [], total: 0, error: null });
  });

  it("erro do banco volta como erro, traduzido", async () => {
    usar({ data: null, error: { message: "caiu" } });
    const r = await buscarContatosParaCliente("");
    expect(r.linhas).toEqual([]);
    expect(r.error).toBe("Não foi possível concluir. Tente de novo.");
  });
});

describe("criarCliente › Parceiro (PAR-5)", () => {
  const PARCEIRO = "22222222-2222-4222-8222-222222222222";

  it("manda o parceiro e só o nome, e leva ao perfil em Projetos", async () => {
    await expect(
      criarCliente(
        VAZIO,
        formulario({ modo_contato: "parceiro", parceiro_id: PARCEIRO, nome_do_cliente: " Fulano de Tal " }),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT /clientes/${PESSOA}?aba=projetos&novo-processo=novo`);

    expect(rpc).toHaveBeenCalledWith("criar_cliente", {
      p_organizacao: "org-1",
      p_parceiro: PARCEIRO,
      p_novo_contato: { full_name: "Fulano de Tal" },
      p_confirmar_contato_parecido: false,
    });
  });

  it("sem parceiro escolhido, para antes do banco", async () => {
    const r = await criarCliente(VAZIO, formulario({ modo_contato: "parceiro", nome_do_cliente: "Fulano" }));
    expect(r.error).toBe("Escolha o parceiro.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sem nome, para antes do banco", async () => {
    const r = await criarCliente(
      VAZIO,
      formulario({ modo_contato: "parceiro", parceiro_id: PARCEIRO, nome_do_cliente: "   " }),
    );
    expect(r.error).toBe("Informe o nome do cliente.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("nome repetido no parceiro: devolve os homônimos, sem gravar", async () => {
    usar({
      data: {
        situacao: "precisa_confirmar",
        homonimos: [{ id: PESSOA, nome: "Fulano de Tal" }],
        parceiro: "Thais Fabrini",
      },
      error: null,
    });

    const r = await criarCliente(
      VAZIO,
      formulario({ modo_contato: "parceiro", parceiro_id: PARCEIRO, nome_do_cliente: "fulano de tal" }),
    );

    expect(r.ok).toBeUndefined();
    expect(r.homonimos).toEqual([{ id: PESSOA, nome: "Fulano de Tal" }]);
    expect(r.parceiro).toBe("Thais Fabrini");
    expect(r.token).toBeTruthy();
  });

  it("a confirmação vem do campo de confirmação", async () => {
    await expect(
      criarCliente(
        VAZIO,
        formulario({
          modo_contato: "parceiro",
          parceiro_id: PARCEIRO,
          nome_do_cliente: "Fulano",
          [CAMPO_CONFIRMAR_PARECIDO]: "1",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(rpc).toHaveBeenCalledWith(
      "criar_cliente",
      expect.objectContaining({ p_confirmar_contato_parecido: true }),
    );
  });
});
