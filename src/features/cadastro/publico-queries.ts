import { formaParaOClienteSchema, type FormaParaOCliente } from "@/lib/forma-do-cliente";
import { clienteAnonimo } from "@/lib/supabase/anonimo";

/**
 * O que a página pública da ficha pode saber, a partir do token.
 *
 * Vem de `abrir_ficha_de_cadastro` (0035, 0065): o estado do link; só enquanto
 * ele está aberto, nome, e-mail e telefone, que o lead já tinha dado; e, só
 * quando o cliente está no pagamento, a forma — montada no banco, sem a
 * cotação. Nunca documento nem endereço: quem abre o link de novo não lê o
 * que foi enviado.
 */

export type FichaAberta = {
  situacao: "aberta" | "aguardando_pagamento" | "respondida" | "enviada" | "expirada" | "cancelada";
  nome: string | null;
  email: string | null;
  ddi: string | null;
  telefone: string | null;
  organizacao: string;
  /** `so_pagamento`: o link com a forma que não aceita dados pessoais (4b). */
  modo: "completa" | "so_pagamento";
  /** O link leva a forma de pagamento: a ficha diz "Passo 1 de 2". */
  tem_forma: boolean;
  forma: FormaParaOCliente | null;
};

const SITUACOES: FichaAberta["situacao"][] = [
  "aberta",
  "aguardando_pagamento",
  "respondida",
  "enviada",
  "expirada",
  "cancelada",
];

const FORMATO_INESPERADO = "O servidor respondeu num formato inesperado.";

/** O formato do token que o banco gera. Fora disso nem se pergunta ao banco. */
export const TOKEN = /^[A-Za-z0-9_-]{40,128}$/;

export async function abrirFicha(
  token: string,
): Promise<{ ficha: FichaAberta | null; error: string | null }> {
  if (!TOKEN.test(token)) return { ficha: null, error: null };

  const { data, error } = await clienteAnonimo().rpc("abrir_ficha_de_cadastro", {
    p_token: token,
  });
  if (error) return { ficha: null, error: error.message };

  const linha = data?.[0];
  if (!linha) return { ficha: null, error: null };

  const situacao = SITUACOES.find((s) => s === linha.situacao);
  if (!situacao) return { ficha: null, error: FORMATO_INESPERADO };

  // A forma passa por esquema: fora do formato é erro, e não um pagamento
  // desenhado pela metade para o cliente confirmar.
  let forma: FormaParaOCliente | null = null;
  if (linha.forma !== null && linha.forma !== undefined) {
    const lida = formaParaOClienteSchema.safeParse(linha.forma);
    if (!lida.success) return { ficha: null, error: FORMATO_INESPERADO };
    forma = lida.data;
  }

  return {
    error: null,
    ficha: {
      situacao,
      nome: linha.nome,
      email: linha.email,
      ddi: linha.ddi,
      telefone: linha.telefone,
      organizacao: linha.organizacao,
      modo: linha.modo === "so_pagamento" ? "so_pagamento" : "completa",
      tem_forma: linha.tem_forma === true,
      forma,
    },
  };
}
