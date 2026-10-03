import { soDigitos } from "@/lib/documentos";

/**
 * Regras da ficha de cadastro que não dependem do banco — testadas em
 * `regras.test.ts`.
 */

/** Quanto tempo o lead tem para preencher. Depois disso, gera-se outro link. */
export const PRAZO_DO_LINK_EM_DIAS = 15;

export function validadeDoLink(agora: Date = new Date()): Date {
  return new Date(agora.getTime() + PRAZO_DO_LINK_EM_DIAS * 24 * 60 * 60 * 1000);
}

type Link = {
  expires_at: string;
  cancelled_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
};

export type SituacaoDaFicha =
  | "sem-link"
  | "aguardando"
  | "expirada"
  | "recebida"
  | "conferida";

/**
 * Onde a ficha de um contato está, a partir do link mais recente dele.
 *
 * Sem coluna de status, como no resto do app: o estado sai das datas, e não
 * envelhece. Enviada vem primeiro — uma ficha recebida não vira "expirada"
 * quando o prazo do link passa.
 */
export function situacaoDaFicha(link: Link | null, agora: Date = new Date()): SituacaoDaFicha {
  if (!link) return "sem-link";
  if (link.submitted_at) return link.reviewed_at ? "conferida" : "recebida";
  if (link.cancelled_at) return "sem-link";
  if (new Date(link.expires_at).getTime() <= agora.getTime()) return "expirada";
  return "aguardando";
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
