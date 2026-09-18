/**
 * Regras do processo que não dependem do banco — testadas em `regras.test.ts`.
 */

// ------------------------------------------------------------------ progresso

/**
 * Pastas obrigatórias resolvidas sobre pastas obrigatórias.
 *
 * Contar arquivos não fecha: com pasta livre não existe denominador, ninguém
 * sabe de antemão quantos arquivos "Rendimentos" deveria ter. O que fecha é a
 * marcação manual de resolvida, decisão do Renato.
 *
 * Arredonda para baixo: 99,5% não pode aparecer como 100% com pasta faltando.
 * Sem pasta obrigatória o percentual é nulo — o processo não está completo, está
 * sem exigência configurada, e a tela precisa dizer isso.
 */
export function progresso(
  pastas: { is_required: boolean; resolved_at: string | null }[],
): { resolvidas: number; total: number; percentual: number | null } {
  const obrigatorias = pastas.filter((p) => p.is_required);
  const resolvidas = obrigatorias.filter((p) => p.resolved_at !== null).length;
  const total = obrigatorias.length;

  return {
    resolvidas,
    total,
    percentual: total === 0 ? null : Math.floor((resolvidas / total) * 100),
  };
}

// ---------------------------------------------------------------------- prazo

/**
 * Data-limite da pasta: início do processo mais os dias que o visto define.
 *
 * Trabalha com a data como texto `AAAA-MM-DD`, em UTC do começo ao fim. Com
 * `new Date("2026-09-18")` no fuso de São Paulo a data vira dia 17 à noite, e o
 * prazo andaria um dia para trás sem ninguém perceber.
 */
export function prazoDaPasta(
  inicio: string,
  dias: number | null,
): string | null {
  if (dias === null) return null;

  const [ano, mes, dia] = inicio.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  data.setUTCDate(data.getUTCDate() + dias);

  return data.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------- arquivo

/** Nome de arquivo seguro para caminho: sem acento, espaço, barra ou ponto extra. */
function limparNome(nome: string): string {
  const ponto = nome.lastIndexOf(".");
  const base = ponto > 0 ? nome.slice(0, ponto) : nome;
  const extensao = ponto > 0 ? nome.slice(ponto + 1) : "";

  const limpo = (texto: string) =>
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const b = limpo(base) || "arquivo";
  const e = limpo(extensao);
  return e ? `${b}.${e}` : b;
}

/**
 * Onde o arquivo mora no Storage.
 *
 * A organização vem **primeiro** de propósito: é pela primeira pasta do caminho
 * que as policies do bucket decidem quem vê o quê. O id do arquivo na frente do
 * nome evita colisão quando o cliente manda dois "documento.pdf".
 */
export function caminhoDoArquivo({
  organizacao,
  processo,
  pasta,
  arquivo,
  nome,
}: {
  organizacao: string;
  processo: string;
  pasta: string;
  arquivo: string;
  nome: string;
}): string {
  return `${organizacao}/${processo}/${pasta}/${arquivo}-${limparNome(nome)}`;
}

/**
 * O caminho que o navegador diz ter enviado é mesmo desta pasta?
 *
 * O navegador sobe o arquivo direto no Storage e depois pede ao servidor para
 * registrá-lo. O servidor não confia no caminho recebido: ele precisa ter
 * exatamente quatro partes e as três primeiras iguais às da pasta — senão um
 * registro poderia apontar para o arquivo de outra pasta ou de outro processo.
 */
export function caminhoPertence(
  caminho: string,
  {
    organizacao,
    processo,
    pasta,
  }: { organizacao: string; processo: string; pasta: string },
): boolean {
  const partes = caminho.split("/");
  if (partes.length !== 4) return false;
  if (partes.some((p) => p === "" || p === "." || p === "..")) return false;
  return (
    partes[0] === organizacao && partes[1] === processo && partes[2] === pasta
  );
}

// -------------------------------------------------------------------- recusa

/** Menos que isto não orienta ninguém — "ruim" não diz o que trocar. */
const MOTIVO_MINIMO = 10;

/**
 * Motivo de recusa de um arquivo.
 *
 * É o texto que o cliente lê para saber o que mandar de novo. Vazio ou curto
 * demais, a recusa vira um "não" sem saída — e o próximo passo é uma troca de
 * mensagens para descobrir o que estava errado.
 */
export function motivoDeRecusa(
  texto: string,
): { ok: true; motivo: string } | { ok: false; erro: string } {
  const motivo = texto.trim();
  if (motivo.length === 0) {
    return { ok: false, erro: "Escreva o motivo — é o que o cliente vai ler." };
  }
  if (motivo.length < MOTIVO_MINIMO) {
    return {
      ok: false,
      erro: "Motivo curto demais. Diga o que precisa ser trocado.",
    };
  }
  return { ok: true, motivo };
}
