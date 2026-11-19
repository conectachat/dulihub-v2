/**
 * O que vale para todo arquivo que o navegador sobe direto ao depósito —
 * documentos do processo, documentos do cliente, anexos da parcela —, testado
 * em `arquivos.test.ts`.
 *
 * O navegador sobe direto: o servidor não recebe 20 MB. Por isso as regras
 * de nome, tipo e tamanho são conferidas aqui antes, e o registro no banco
 * vem depois do objeto, removendo-o se for recusado.
 */

/** Os mesmos limites dos depósitos `documentos`, `pessoas` e `financeiro`. */
export const LIMITE_MB = 20;
const EXTENSOES = ["pdf", "jpg", "jpeg", "png", "webp", "heic", "doc", "docx", "xls", "xlsx"];

/** O `accept` do campo de arquivo, igual à lista acima. */
export const ACEITOS = EXTENSOES.map((e) => `.${e}`).join(",");

export const extensao = (nome: string) => nome.slice(nome.lastIndexOf(".") + 1).toLowerCase();

/**
 * Nome de arquivo seguro para caminho: sem acento, espaço, barra ou ponto
 * extra. O depósito recusa chave fora do ASCII (`InvalidKey`), e uma barra
 * viraria uma pasta a mais — que o banco recusa ao conferir o caminho.
 */
export function limparNome(nome: string): string {
  const ponto = nome.lastIndexOf(".");
  const base = ponto > 0 ? nome.slice(0, ponto) : nome;
  const ext = ponto > 0 ? nome.slice(ponto + 1) : "";

  const limpo = (texto: string) =>
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const b = limpo(base) || "arquivo";
  const e = limpo(ext);
  return e ? `${b}.${e}` : b;
}

export function arquivoAceito(arquivo: {
  name: string;
  type: string;
  size: number;
}): { ok: true } | { ok: false; erro: string } {
  if (!EXTENSOES.includes(extensao(arquivo.name))) {
    return {
      ok: false,
      erro: `${arquivo.name}: tipo não aceito. Use PDF, imagem, Word ou Excel.`,
    };
  }
  const mb = arquivo.size / (1024 * 1024);
  if (mb > LIMITE_MB) {
    return {
      ok: false,
      erro: `${arquivo.name} tem ${Math.round(mb)} MB — o limite é ${LIMITE_MB} MB.`,
    };
  }
  return { ok: true };
}

/** O pedaço do Storage que o envio usa — o de verdade, ou um falso no teste. */
type Armazenamento = {
  from(deposito: string): {
    upload(
      caminho: string,
      arquivo: File,
      opcoes: { contentType?: string },
    ): Promise<{ error: unknown }>;
    remove(caminhos: string[]): Promise<unknown>;
  };
};

/**
 * Sobe o objeto e registra a linha. Registro recusado → o objeto que subiu é
 * removido, para não ficar arquivo órfão no depósito (o depósito não sabe do
 * banco). O erro volta com o nome do arquivo na frente, pronto para a tela.
 */
export async function enviarERegistrar(
  storage: Armazenamento,
  deposito: string,
  caminho: string,
  arquivo: File,
  registrar: () => Promise<{ error: string | null }>,
): Promise<{ error: string | null }> {
  const envio = await storage
    .from(deposito)
    .upload(caminho, arquivo, { contentType: arquivo.type || undefined });
  if (envio.error) {
    return { error: `${arquivo.name}: não foi possível enviar. Tente de novo.` };
  }

  const registro = await registrar();
  if (registro.error) {
    await storage.from(deposito).remove([caminho]);
    return { error: `${arquivo.name}: ${registro.error}` };
  }

  return { error: null };
}
