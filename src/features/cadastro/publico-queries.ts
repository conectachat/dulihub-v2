import { clienteAnonimo } from "@/lib/supabase/anonimo";

/**
 * O que a página pública da ficha pode saber, a partir do token.
 *
 * Vem de `abrir_ficha_de_cadastro` (0035): estado do link, e — só enquanto
 * ele está aberto — nome, e-mail e telefone, que o lead já tinha dado. Nunca
 * documento nem endereço: quem abre o link de novo não lê o que foi enviado.
 */

export type FichaAberta = {
  situacao: "aberta" | "enviada" | "expirada" | "cancelada";
  nome: string | null;
  email: string | null;
  ddi: string | null;
  telefone: string | null;
  organizacao: string;
};

/** O formato do que `gerarLink` produz. Fora disso nem se pergunta ao banco. */
const TOKEN = /^[A-Za-z0-9_-]{40,128}$/;

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

  return {
    error: null,
    ficha: { ...linha, situacao: linha.situacao as FichaAberta["situacao"] },
  };
}
