"use server";

import { traduzirErro } from "@/lib/erros";
import { clienteAnonimo } from "@/lib/supabase/anonimo";

import type { EstadoDaFicha } from "./estado";
import { abrirFicha, TOKEN } from "./publico-queries";
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
  // Os dados já chegaram, de outro aparelho: o link continua aberto para o
  // pagamento, e atualizar a página leva até ele.
  if (aberta?.situacao === "aguardando_pagamento") {
    return { error: "Seus dados já foram recebidos. Atualize a página para ver a forma de pagamento." };
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

const INDISPONIVEL = "Este link não está mais disponível.";

/** O mesmo limite do banco (`responder_forma_de_pagamento`, 0065). */
const LIMITE_DO_MOTIVO = 500;

/**
 * A resposta do cliente à forma de pagamento (entrega 4b, FIC-8): Confirmo ou
 * Há algo errado, com o motivo. Também sem login, pela terceira função da
 * porta anônima.
 *
 * Do navegador vão só o sim, o não e o motivo: a cópia do combinado, que fica
 * como prova, é montada dentro do banco — a mesma forma que o cliente leu. O
 * motivo longo nem sai daqui; o banco confere de novo.
 */
export async function responderForma(
  token: string,
  aceita: boolean,
  motivo: string,
): Promise<{ error: string | null }> {
  if (!TOKEN.test(token)) return { error: INDISPONIVEL };

  const aparado = motivo.trim();
  if (!aceita && aparado.length > LIMITE_DO_MOTIVO) {
    return { error: "O motivo vai até 500 caracteres." };
  }

  const { error } = await clienteAnonimo().rpc("responder_forma_de_pagamento", {
    p_token: token,
    p_aceita: aceita,
    // Com Confirmo, o motivo não vai: o banco não o guardaria.
    ...(aceita ? {} : { p_motivo: aparado }),
  });
  if (error) {
    // O banco recusa sem dizer por quê ("não está mais disponível"). Com a
    // página aberta, o prazo pode ter vencido, ou o cliente já respondeu de
    // outro aparelho: a ficha diz qual, e a frase diz o que fazer.
    const { ficha } = await abrirFicha(token);
    if (ficha?.situacao === "expirada") {
      return { error: `Este link expirou. Peça um novo à ${ficha.organizacao}.` };
    }
    if (ficha?.situacao === "respondida") return { error: "Você já respondeu a forma de pagamento." };
    return { error: traduzirErro(error) };
  }

  return { error: null };
}
