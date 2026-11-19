// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { anexar, removerAnexo } from "./anexos";

/**
 * Anexos da parcela (CLI-6): boleto, nota fiscal, comprovante. Pelo cliente
 * de navegador, só com internet — a tela Financeiro é migrada e não tem
 * Server Action. A prova do banco (caminho conferido, quem lê, nenhum órfão)
 * está em `tests/rls/anexos-da-parcela.test.ts`; aqui, o que a tela pede.
 */

const ALVO = { organizacao: "o1", pessoa: "p1", cobranca: "c1", parcela: "i1" };
const arquivo = new File(["%PDF"], "Boleto Março.pdf", { type: "application/pdf" });

function bancoFalso({
  erroNaLinha = null,
  erroAoApagar = null,
}: { erroNaLinha?: string | null; erroAoApagar?: string | null } = {}) {
  const upload = vi.fn(async () => ({ error: null }));
  const remove = vi.fn(async () => ({ error: null }));
  const insert = vi.fn(async () => ({ error: erroNaLinha ? { message: erroNaLinha } : null }));
  const apagou = vi.fn(async () => ({
    data: erroAoApagar ? null : [{ storage_path: "o1/p1/c1/i1/a1/boleto.pdf" }],
    error: erroAoApagar ? { message: erroAoApagar } : null,
  }));
  const del = vi.fn(() => ({ eq: () => ({ select: apagou }) }));
  const supabase = {
    storage: { from: vi.fn(() => ({ upload, remove })) },
    from: vi.fn(() => ({ insert, delete: del })),
  };
  return { supabase, upload, remove, insert, del };
}

beforeEach(() => vi.clearAllMocks());

describe("anexar", () => {
  it("sobe ao depósito financeiro, no caminho da parcela, e registra na organização dela", async () => {
    const b = bancoFalso();

    const r = await anexar(b.supabase as never, { ...ALVO, tipo: "boleto", arquivo });

    expect(r.error).toBeNull();
    expect(b.supabase.storage.from).toHaveBeenCalledWith("financeiro");
    const [caminho] = b.upload.mock.calls[0] as unknown as [string];
    expect(caminho).toMatch(/^o1\/p1\/c1\/i1\/[0-9a-f-]{36}\/boleto-marco\.pdf$/);
    expect(b.supabase.from).toHaveBeenCalledWith("installment_files");
    expect(b.insert).toHaveBeenCalledWith({
      id: caminho.split("/")[4],
      organization_id: "o1",
      installment_id: "i1",
      kind: "boleto",
      filename: "Boleto Março.pdf",
      storage_path: caminho,
      mime_type: "application/pdf",
      size_bytes: arquivo.size,
    });
  });

  it("linha recusada remove o objeto que subiu", async () => {
    const b = bancoFalso({ erroNaLinha: "falhou" });

    const r = await anexar(b.supabase as never, { ...ALVO, tipo: "boleto", arquivo });

    expect(r.error).toMatch(/^Boleto Março\.pdf: /);
    expect(b.remove).toHaveBeenCalled();
  });

  it("tipo de arquivo fora da lista nem sobe", async () => {
    const b = bancoFalso();
    const video = new File(["x"], "video.mp4", { type: "video/mp4" });

    const r = await anexar(b.supabase as never, { ...ALVO, tipo: "outro", arquivo: video });

    expect(r.error).toBe("video.mp4: tipo não aceito. Use PDF, imagem, Word ou Excel.");
    expect(b.upload).not.toHaveBeenCalled();
  });
});

describe("removerAnexo", () => {
  it("apaga a linha e depois o objeto", async () => {
    const b = bancoFalso();

    const r = await removerAnexo(b.supabase as never, "a1");

    expect(r.error).toBeNull();
    expect(b.remove).toHaveBeenCalledWith(["o1/p1/c1/i1/a1/boleto.pdf"]);
  });

  it("linha que não se apaga deixa o objeto onde está", async () => {
    const b = bancoFalso({ erroAoApagar: "sem permissão" });

    const r = await removerAnexo(b.supabase as never, "a1");

    expect(r.error).not.toBeNull();
    expect(b.remove).not.toHaveBeenCalled();
  });
});
