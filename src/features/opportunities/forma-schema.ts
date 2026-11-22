import { z } from "zod";

import { parseCotacao } from "@/lib/numbers";
import { METODOS } from "@/lib/parcelas";

import { erroDaParte, LIMITES } from "./forma-regras";

/**
 * O que a janela da forma e as ações aceitam (entrega 4a) — puro, o mesmo dos
 * dois lados.
 *
 * O zod 4 responde em inglês por padrão; cada campo leva a frase em português.
 * O tipo errado (que a tela nunca manda, só quem chama a ação por fora) dá uma
 * frase só, e a regra de cada parte é a de `erroDaParte`, para a tela e a ação
 * darem a mesma primeira frase. A data da parcela entra como texto e o dia é
 * conferido lá: se o campo conferisse, a mensagem fixa dele viria na frente.
 */

const FORMATO = "A forma de pagamento veio num formato inválido.";

const numero = z.number({ error: FORMATO });

export const parteSchema = z
  .object(
    {
      label: z.string({ error: FORMATO }),
      method: z.enum(METODOS, { error: FORMATO }),
      currency: z.enum(["BRL", "USD"], { error: FORMATO }),
      total: numero,
      installments_count: numero,
      parcelas: z.array(
        z.object(
          { number: numero, amount: numero, due_on: z.string({ error: FORMATO }) },
          { error: FORMATO },
        ),
        { error: FORMATO },
      ),
    },
    { error: FORMATO },
  )
  .superRefine((parte, ctx) => {
    const erro = erroDaParte(parte);
    if (erro) ctx.addIssue({ code: "custom", message: erro });
  });

export const formaSchema = z.object(
  {
    partes: z
      .array(parteSchema, { error: FORMATO })
      .max(LIMITES.partes, "A forma vai até 10 partes."),
  },
  { error: FORMATO },
);

export type FormaParaSalvar = z.infer<typeof formaSchema>;

/** Texto opcional com limite: vazio vira nulo. */
function textoOpcional(limite: number, frase: string) {
  return z
    .string({ error: frase })
    .nullish()
    .transform((v) => (v ?? "").trim())
    .refine((v) => v.length <= limite, frase)
    .transform((v) => v || null);
}

export const observacaoSchema = textoOpcional(
  LIMITES.observacao,
  "A observação vai até 500 caracteres.",
);

export const anotacaoDaCotacaoSchema = textoOpcional(
  200,
  "A anotação da cotação vai até 200 caracteres.",
);

const COTACAO = "Informe uma cotação maior que zero.";

/**
 * A cotação do C6 (FIC-11), lida como a da baixa: "5,425" é cinco e 425
 * milésimos, não milhar (G3). Vazia limpa o campo.
 */
export const cotacaoSchema = z
  .string({ error: COTACAO })
  .nullish()
  .transform((v, ctx) => {
    const bruto = (v ?? "").trim();
    if (!bruto) return null;
    const valor = parseCotacao(bruto);
    if (valor === null || !(valor > 0)) {
      ctx.addIssue({ code: "custom", message: COTACAO });
      return z.NEVER;
    }
    return valor;
  });
