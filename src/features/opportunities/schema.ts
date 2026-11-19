import { z } from "zod";

import { parseMoney } from "@/lib/numbers";

/**
 * Valor e moeda de um visto do negócio (CRM-13). O valor é obrigatório: em
 * outra moeda que não a do preço o campo vem vazio, e precisa ser preenchido
 * — nunca convertido. Só BRL e USD, como o banco (0051).
 */
export const itemSchema = z.object({
  amount: z
    .string()
    .nullish()
    .transform(parseMoney)
    .refine((v) => v !== null, "Informe o valor.")
    .refine((v) => v === null || v >= 0, "O valor não pode ser negativo."),
  currency: z.enum(["BRL", "USD"], "Escolha a moeda."),
});

export function itemFromForm(formData: FormData) {
  return itemSchema.safeParse({
    amount: formData.get("amount"),
    currency: formData.get("currency"),
  });
}

/**
 * O que `ganhar_negocio` (0052) devolve, com e sem `p_simular`.
 *
 * Chega do banco como `Json`; este esquema é o que o transforma em tipo sem
 * `as unknown as` (AGENTS), e recusa um formato que a tela não saberia
 * desenhar. O resumo da tela e o resultado da gravação têm o mesmo formato:
 * simulando, o `id` de cada processo vem nulo.
 */
export const resumoDoGanhoSchema = z.object({
  negocio: z.string(),
  pessoa: z.object({
    id: z.string(),
    nome: z.string(),
    vira_cliente: z.boolean(),
  }),
  itens: z.array(
    z.object({
      id: z.string(),
      visa_name: z.string(),
      amount: z.number(),
      currency: z.string(),
    }),
  ),
  processos: z.array(
    z.object({
      item: z.string(),
      titulo: z.string(),
      id: z.string().nullable(),
    }),
  ),
  // Entrega 4: as cobranças da forma de pagamento. Até lá, sempre vazia.
  cobrancas: z.array(z.unknown()),
  avisos: z.array(z.string()),
});

export type ResumoDoGanho = z.infer<typeof resumoDoGanhoSchema>;
