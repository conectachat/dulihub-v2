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

function erroDoEmail(valor: string | null): string | null {
  const email = aparar(valor);
  if (email === null) return "Informe o e-mail";
  return FORMATO_EMAIL.test(email) ? null : "E-mail inválido";
}

function erroDoDdi(valor: string | null): string | null {
  const ddi = aparar(valor);
  if (ddi === null) return "Informe o DDI";
  return FORMATO_DDI.test(ddi) ? null : "DDI inválido (ex.: +55)";
}

function erroDoTelefone(valor: string | null): string | null {
  const telefone = aparar(valor);
  if (telefone === null) return "Informe o telefone";
  const digitos = soDigitos(telefone).length;
  return digitos < 8 || digitos > 15 ? "O telefone precisa ter de 8 a 15 dígitos" : null;
}

/**
 * O erro de cada campo, independente dos outros — para a ficha apontar o
 * e-mail e o telefone de uma vez, em vez de um por envio.
 */
export function errosDeContato(contato: Contato): Partial<Record<CampoDeContato, string>> {
  const erros: Partial<Record<CampoDeContato, string>> = {};
  const email = erroDoEmail(contato.email);
  const ddi = erroDoDdi(contato.ddi);
  const telefone = erroDoTelefone(contato.telefone);
  if (email) erros.email = email;
  if (ddi) erros.ddi = ddi;
  if (telefone) erros.telefone = telefone;
  return erros;
}

/** A primeira regra que falha, na ordem e-mail → DDI → telefone (a mesma do banco). */
export function erroDeContato(
  contato: Contato,
): { campo: CampoDeContato; mensagem: string } | null {
  const erros = errosDeContato(contato);
  for (const campo of ["email", "ddi", "telefone"] as const) {
    const mensagem = erros[campo];
    if (mensagem) return { campo, mensagem };
  }
  return null;
}
