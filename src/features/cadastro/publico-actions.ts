"use server";

import { traduzirErro } from "@/lib/erros";
import { clienteAnonimo } from "@/lib/supabase/anonimo";

import type { EstadoDaFicha } from "./estado";
import { abrirFicha } from "./publico-queries";
import { declaracao } from "./regras";
import { fichaDoFormulario } from "./schema";

/**
 * A porta do lead: a única ação do app que roda **sem login**.
 *
 * Quem autoriza é o token, conferido dentro do banco por
 * `enviar_ficha_de_cadastro` (0035) — uso único, com prazo, uma pessoa só.
 * Este arquivo não decide nada: valida para o erro aparecer no campo, e o
 * banco valida de novo, porque a função é chamável direto pela API.
 *
 * O texto da declaração é montado **aqui**, com o nome da organização vindo do
 * banco. O que o navegador manda é só a caixa marcada — aceitar o texto que
 * ele enviasse seria guardar como "aceito" uma frase que ninguém mostrou.
 */
export async function enviarFicha(
  token: string,
  formData: FormData,
): Promise<EstadoDaFicha> {
  const ficha = fichaDoFormulario(formData, "completa");
  if (!ficha.ok) return { error: ficha.erro, campos: ficha.campos };

  if (formData.get("aceite") !== "on") {
    return {
      error: "Confira os campos destacados.",
      campos: { aceite: "Marque para enviar" },
    };
  }

  const { ficha: aberta, error: erroAoAbrir } = await abrirFicha(token);
  if (erroAoAbrir) {
    return { error: "Não foi possível enviar agora. Tente de novo em instantes." };
  }
  if (!aberta || aberta.situacao !== "aberta") {
    return { error: "Este link não está mais disponível. Peça um novo a quem te enviou." };
  }

  const { error } = await clienteAnonimo().rpc("enviar_ficha_de_cadastro", {
    p_token: token,
    p_dados: ficha.dados,
    p_consentimento: declaracao(aberta.organizacao),
  });
  if (error) return { error: traduzirErro(error) };

  return { error: null };
}
