// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { contextoAtual } from "@/lib/organizacao";

import { registrarDocumento } from "./documentos-actions";

/**
 * Registrar o documento do cliente que o navegador acabou de subir (CLI-8).
 *
 * A organização vem **da pessoa**, nunca de quem clicou: um consultor da Duli
 * atendendo cliente de um parceiro gravaria a linha na organização errada, e
 * a RLS não pegaria — a linha seria válida. O caminho é conferido contra a
 * pessoa antes de gravar (o banco confere de novo, 0047).
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/organizacao", () => ({ contextoAtual: vi.fn() }));

const PESSOA = { id: "p1", organization_id: "org-da-pessoa" };

function bancoFalso() {
  const inserido = vi.fn(async () => ({ data: [{ id: "a1" }], error: null }));
  const insert = vi.fn(() => ({ select: inserido }));
  const supabase = {
    from: vi.fn((tabela: string) =>
      tabela === "people"
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: PESSOA, error: null }) }) }) }
        : { insert },
    ),
  };
  return { supabase, insert };
}

let banco: ReturnType<typeof bancoFalso>;

const dados = (mudar: Partial<Parameters<typeof registrarDocumento>[0]> = {}) => ({
  pessoaId: "p1",
  id: "a1",
  caminho: "org-da-pessoa/p1/a1/passaporte.pdf",
  nome: "Passaporte.pdf",
  tipo: "application/pdf",
  tamanho: 1234,
  categoria: "passaporte",
  ...mudar,
});

beforeEach(() => {
  vi.clearAllMocks();
  banco = bancoFalso();
  vi.mocked(contextoAtual).mockResolvedValue({
    supabase: banco.supabase,
    userId: "u1",
    organizationId: "org-de-quem-clicou",
    error: null,
  } as never);
});

describe("registrarDocumento", () => {
  it("grava na organização da pessoa, no depósito pessoas, com a categoria", async () => {
    const r = await registrarDocumento(dados());

    expect(r.error).toBeNull();
    expect(banco.insert).toHaveBeenCalledWith({
      id: "a1",
      organization_id: "org-da-pessoa",
      person_id: "p1",
      bucket: "pessoas",
      path: "org-da-pessoa/p1/a1/passaporte.pdf",
      filename: "Passaporte.pdf",
      mime_type: "application/pdf",
      size_bytes: 1234,
      category: "passaporte",
      uploaded_by: "u1",
    });
  });

  it("caminho que não é o desta pessoa é recusado sem gravar", async () => {
    const r = await registrarDocumento(dados({ caminho: "org-de-quem-clicou/p1/a1/passaporte.pdf" }));

    expect(r.error).toBe("O arquivo não pertence a este cliente.");
    expect(banco.insert).not.toHaveBeenCalled();
  });

  it("categoria fora da lista é recusada sem gravar", async () => {
    const r = await registrarDocumento(dados({ categoria: "xyz" }));

    expect(r.error).toBe("Escolha a categoria do documento.");
    expect(banco.insert).not.toHaveBeenCalled();
  });
});
