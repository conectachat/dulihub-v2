// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { arquivoAceito, enviarERegistrar, limparNome } from "./arquivos";

/**
 * O que vale para todo arquivo que o navegador sobe direto ao depósito:
 * documentos do processo, documentos do cliente e anexos da parcela.
 */

describe("limparNome", () => {
  it("tira acento, espaço e maiúscula: o depósito recusa chave fora do ASCII", () => {
    expect(limparNome("Comprovante de residência.pdf")).toBe("comprovante-de-residencia.pdf");
  });

  it("barra vira traço: uma pasta a mais feriria o caminho conferido pelo banco", () => {
    expect(limparNome("contrato/assinado.PDF")).toBe("contrato-assinado.pdf");
  });

  it("nome vazio vira 'arquivo', e ponto extra não vira pasta", () => {
    expect(limparNome("///.pdf")).toBe("arquivo.pdf");
    expect(limparNome("rg.frente.jpg")).toBe("rg-frente.jpg");
  });
});

describe("arquivoAceito", () => {
  const mb = 1024 * 1024;

  it("aceita PDF, imagem e Office até 20 MB", () => {
    expect(arquivoAceito({ name: "a.pdf", type: "application/pdf", size: 5 * mb })).toEqual({ ok: true });
    expect(arquivoAceito({ name: "a.xlsx", type: "", size: mb })).toEqual({ ok: true });
  });

  it("recusa acima de 20 MB, dizendo o tamanho", () => {
    expect(arquivoAceito({ name: "scan.pdf", type: "application/pdf", size: 25 * mb })).toEqual({
      ok: false,
      erro: "scan.pdf tem 25 MB — o limite é 20 MB.",
    });
  });

  it("recusa tipo fora da lista", () => {
    expect(arquivoAceito({ name: "video.mp4", type: "video/mp4", size: mb })).toEqual({
      ok: false,
      erro: "video.mp4: tipo não aceito. Use PDF, imagem, Word ou Excel.",
    });
  });
});

describe("enviarERegistrar", () => {
  const arquivo = new File(["%PDF"], "passaporte.pdf", { type: "application/pdf" });

  function depositoFalso(erroNoEnvio: string | null = null) {
    const upload = vi.fn(async () => ({ error: erroNoEnvio ? { message: erroNoEnvio } : null }));
    const remove = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ upload, remove }));
    return { storage: { from }, from, upload, remove };
  }

  it("envia o objeto e registra", async () => {
    const d = depositoFalso();
    const registrar = vi.fn(async () => ({ error: null }));

    const r = await enviarERegistrar(d.storage, "pessoas", "o/p/a/passaporte.pdf", arquivo, registrar);

    expect(r).toEqual({ error: null });
    expect(d.from).toHaveBeenCalledWith("pessoas");
    expect(d.upload).toHaveBeenCalledWith("o/p/a/passaporte.pdf", arquivo, {
      contentType: "application/pdf",
    });
    expect(registrar).toHaveBeenCalled();
    expect(d.remove).not.toHaveBeenCalled();
  });

  it("envio que falha não registra nada", async () => {
    const d = depositoFalso("rede");
    const registrar = vi.fn(async () => ({ error: null }));

    const r = await enviarERegistrar(d.storage, "pessoas", "o/p/a/x.pdf", arquivo, registrar);

    expect(r.error).toBe("passaporte.pdf: não foi possível enviar. Tente de novo.");
    expect(registrar).not.toHaveBeenCalled();
  });

  it("registro recusado remove o objeto: nada de arquivo órfão no depósito", async () => {
    const d = depositoFalso();
    const registrar = vi.fn(async () => ({ error: "O caminho não é o da pessoa." }));

    const r = await enviarERegistrar(d.storage, "pessoas", "o/p/a/x.pdf", arquivo, registrar);

    expect(r.error).toBe("passaporte.pdf: O caminho não é o da pessoa.");
    expect(d.remove).toHaveBeenCalledWith(["o/p/a/x.pdf"]);
  });

  it("registro que lança (rede caiu no meio) também remove o objeto e devolve erro", async () => {
    const d = depositoFalso();
    const registrar = vi.fn(async (): Promise<{ error: string | null }> => {
      throw new Error("Failed to fetch");
    });

    const r = await enviarERegistrar(d.storage, "pessoas", "o/p/a/x.pdf", arquivo, registrar);

    expect(r.error).toBe("passaporte.pdf: não foi possível registrar. Tente de novo.");
    expect(d.remove).toHaveBeenCalledWith(["o/p/a/x.pdf"]);
  });

  it("envio recusado pela política do depósito diz que falta permissão, e não 'tente de novo'", async () => {
    const d = depositoFalso("new row violates row-level security policy");
    const registrar = vi.fn(async () => ({ error: null }));

    const r = await enviarERegistrar(d.storage, "pessoas", "o/p/a/x.pdf", arquivo, registrar);

    expect(r.error).toBe("passaporte.pdf: você não tem permissão para enviar arquivos aqui.");
  });
});
