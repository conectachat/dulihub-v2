import { soDigitos } from "@/lib/documentos";
import { diaEmSaoPaulo, formatarDiaDaSemana } from "@/lib/formatar";

/**
 * Regras da ficha de cadastro que não dependem do banco — testadas em
 * `regras.test.ts`.
 */

/** Quanto tempo o lead tem para preencher. Depois disso, gera-se outro link. */
export const PRAZO_DO_LINK_EM_DIAS = 15;

export function validadeDoLink(agora: Date = new Date()): Date {
  return new Date(agora.getTime() + PRAZO_DO_LINK_EM_DIAS * 24 * 60 * 60 * 1000);
}

/** Um link da ficha como o banco devolve: as datas dizem em que pé ele está. */
export type LinkLido = {
  created_at: string;
  expires_at: string;
  cancelled_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  /**
   * Fechado: a ficha comum, quando os dados chegam; o link com a forma, quando
   * o cliente responde o pagamento (0064). Aberto é `closed_at` e
   * `cancelled_at` nulos — o mesmo critério do índice de "um aberto por pessoa".
   */
  closed_at: string | null;
};

export type SituacaoDaFicha =
  | "sem-link"
  | "aguardando"
  | "expirada"
  | "recebida"
  | "conferida";

/** O mais recente que passa no filtro. A lista vem na ordem que vier. */
function maisRecente<T extends LinkLido>(links: T[], vale: (l: T) => boolean): T | null {
  let escolhido: T | null = null;
  for (const l of links) {
    if (vale(l) && (!escolhido || l.created_at > escolhido.created_at)) escolhido = l;
  }
  return escolhido;
}

/**
 * A ficha recebida (I4, Q11 decidida em 23/nov): o link mais recente com os
 * dados do cliente, **cancelado ou não**. Um link novo não a invalida — o
 * aviso da Início fica até o "Conferi". Antes, o contato mostrava só o link
 * mais recente, e gerar outro escondia o "Conferi" com o aviso ainda aceso.
 */
export function fichaRecebida<T extends LinkLido>(links: T[]): T | null {
  return maisRecente(links, (l) => l.submitted_at !== null);
}

/** O link atual: o mais recente ainda aberto, vencido ou não. */
export function linkAtual<T extends LinkLido>(links: T[]): T | null {
  return maisRecente(links, (l) => l.closed_at === null && l.cancelled_at === null);
}

/**
 * Onde a ficha de um contato está, para o selo — no contato, no lead e no
 * quadro do CRM.
 *
 * Sem coluna de status, como no resto do app: o estado sai das datas, e não
 * envelhece. A ficha recebida sem conferir vem primeiro, porque é o que pede
 * ação; depois, o link atual; depois, a ficha conferida.
 */
export function situacaoDoCadastro(links: LinkLido[], agora: Date = new Date()): SituacaoDaFicha {
  const ficha = fichaRecebida(links);
  if (ficha && !ficha.reviewed_at) return "recebida";

  const link = linkAtual(links);
  if (link) {
    return new Date(link.expires_at).getTime() <= agora.getTime() ? "expirada" : "aguardando";
  }

  return ficha ? "conferida" : "sem-link";
}

/**
 * O último dia em que o link vale, em São Paulo (`AAAA-MM-DD`).
 *
 * O banco grava em `expires_at` o início do dia seguinte ao último
 * (`private.fim_do_prazo_em_dias_uteis`, 0064); um milissegundo antes ainda é
 * o último dia. A tela não conta dias úteis: a regra mora só no banco.
 */
export function ultimoDiaDoLink(expiresAt: string): string {
  return diaEmSaoPaulo(new Date(new Date(expiresAt).getTime() - 1).toISOString());
}

export const ROTULO_DA_SITUACAO: Record<SituacaoDaFicha, string> = {
  "sem-link": "Sem ficha",
  aguardando: "Aguardando o cliente",
  expirada: "Link expirado",
  recebida: "Ficha recebida",
  conferida: "Ficha conferida",
};

/** O endereço público da ficha. */
export function urlDaFicha(origem: string, token: string): string {
  return `${origem.replace(/\/+$/, "")}/cadastro/${token}`;
}

/** O texto que vai pronto para a conversa. Quem envia é a equipe. */
export function mensagemDoWhatsApp(nome: string, url: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  return [
    `Olá, ${primeiro}!`,
    "",
    "Para prepararmos o seu contrato, preencha a ficha de cadastro neste link:",
    url,
    "",
    `O link é só seu e vale por ${PRAZO_DO_LINK_EM_DIAS} dias.`,
  ].join("\n");
}

/**
 * A mensagem do link com a forma de pagamento (entrega 4b): diz até quando ele
 * vale, porque são só 3 dias úteis e o valor envelhece. No link só do
 * pagamento os dados já chegaram, e a mensagem não pede para preencher nada.
 */
export function mensagemDaFormaNoWhatsApp(
  nome: string,
  url: string,
  ultimoDia: string,
  soPagamento = false,
): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  return [
    `Olá, ${primeiro}!`,
    "",
    soPagamento
      ? "Para fecharmos o seu contrato, confira a forma de pagamento neste link:"
      : "Para fecharmos o seu contrato, preencha a ficha e confira a forma de pagamento neste link:",
    url,
    "",
    `O link é só seu e vale até ${formatarDiaDaSemana(ultimoDia, "longo")}.`,
  ].join("\n");
}

/**
 * Abre a conversa do contato com a mensagem pronta. Sem telefone, nulo — a
 * tela oferece só o "Copiar".
 */
export function linkDoWhatsApp(
  ddi: string | null | undefined,
  telefone: string | null | undefined,
  mensagem: string,
): string | null {
  const numero = soDigitos(telefone);
  if (!numero) return null;
  const codigo = soDigitos(ddi) || "55";
  return `https://wa.me/${codigo}${numero}?text=${encodeURIComponent(mensagem)}`;
}

/**
 * A declaração que o lead aceita ao enviar — o mesmo texto do PDF, com o nome
 * de quem vai usar os dados. O texto aceito é guardado junto da resposta.
 */
export function declaracao(organizacao: string): string {
  return (
    "Declaro que as informações acima são verdadeiras e autorizo o uso desses " +
    "dados para fins de elaboração contratual e consultoria imigratória junto " +
    `à ${organizacao}.`
  );
}
