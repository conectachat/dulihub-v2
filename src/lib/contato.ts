import { soDigitos } from "./documentos";

/**
 * Regras de formato do contato (CON-4): todo contato tem e-mail, DDI e
 * telefone. A mesma regra mora no banco, em `private.contato_valido` (0040), e
 * `contato.casos.ts` prova que as duas dizem o mesmo.
 *
 * Espaço e dígito são conjuntos explícitos, nunca `\s` ou `\d`: no Postgres
 * eles mudam com o locale, e no JS o `\s` pega caracteres que o banco não
 * pega. Divergir aqui é a tela aceitar o que o banco recusa.
 */

export const DDI_PADRAO = "+55";

export type CampoDeContato = "email" | "ddi" | "telefone";

export type Contato = { email: string | null; ddi: string | null; telefone: string | null };

/** ESPACO: espaço, tab, quebras, NBSP e BOM — o mesmo conjunto de `private.aparar`. */
const ESPACO = String.raw` \t\n\r\f\v\u00a0\ufeff`;
const NAS_PONTAS = new RegExp(String.raw`^[${ESPACO}]+|[${ESPACO}]+$`, "g");
const FORMATO_EMAIL = new RegExp(String.raw`^[^@${ESPACO}]+@[^@${ESPACO}]+\.[^@${ESPACO}]+$`);
const FORMATO_DDI = /^\+?[0-9]{1,4}$/;

/** Tira ESPACO do começo e do fim; vazio vira nulo. */
export function aparar(texto: string | null | undefined): string | null {
  const aparado = (texto ?? "").replace(NAS_PONTAS, "");
  return aparado === "" ? null : aparado;
}

/** "55" e "+55" → "+55"; aparado; vazio → null; fora do formato → devolve como veio (o erro sai de erroDeContato). */
export function normalizarDdi(ddi: string | null): string | null {
  const aparado = aparar(ddi);
  if (aparado === null) return null;
  return FORMATO_DDI.test(aparado) ? `+${soDigitos(aparado)}` : aparado;
}

/** A primeira regra que falha, na ordem e-mail → DDI → telefone. */
export function erroDeContato(
  contato: Contato,
): { campo: CampoDeContato; mensagem: string } | null {
  const email = aparar(contato.email);
  if (email === null) return { campo: "email", mensagem: "Informe o e-mail" };
  if (!FORMATO_EMAIL.test(email)) return { campo: "email", mensagem: "E-mail inválido" };

  const ddi = aparar(contato.ddi);
  if (ddi === null) return { campo: "ddi", mensagem: "Informe o DDI" };
  if (!FORMATO_DDI.test(ddi)) return { campo: "ddi", mensagem: "DDI inválido (ex.: +55)" };

  const telefone = aparar(contato.telefone);
  if (telefone === null) return { campo: "telefone", mensagem: "Informe o telefone" };
  const digitos = soDigitos(telefone).length;
  if (digitos < 8 || digitos > 15) {
    return { campo: "telefone", mensagem: "O telefone precisa ter de 8 a 15 dígitos" };
  }

  return null;
}
