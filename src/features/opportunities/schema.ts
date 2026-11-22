import { z } from "zod";

import { parseMoney } from "@/lib/numbers";
import { METODOS } from "@/lib/parcelas";

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
 * simulando, o `id` de cada processo e de cada cobrança vem nulo.
 *
 * `forma` e `cobrancas` saem de `private.forma_do_ganho` (0059), a mesma
 * leitura para o resumo e para a gravação. `enviada` e `recusada` só se
 * alcançam na 4b; a tela os trata como rascunho (P9 do plano da 4a).
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
  forma: z.object({
    situacao: z.enum(["sem_forma", "rascunho", "enviada", "recusada", "confirmada", "cobrancas_criadas"]),
    confirmada_em: z.string().nullable(),
    confirmada_por: z.string().nullable(),
    cobrancas_criadas_em: z.string().nullable(),
    partes: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        method: z.enum(METODOS),
        currency: z.enum(["BRL", "USD"]),
        total: z.number(),
        installments_count: z.number().int(),
        parcelas: z.array(
          z.object({ number: z.number().int(), amount: z.number(), due_on: z.string() }),
        ),
      }),
    ),
  }),
  // Uma por parte da forma confirmada; vazia nas outras situações.
  cobrancas: z.array(
    z.object({
      id: z.string().nullable(),
      titulo: z.string(),
      moeda: z.enum(["BRL", "USD"]),
      total: z.number(),
      parcelas: z.number().int(),
    }),
  ),
  avisos: z.array(z.string()),
});

export type ResumoDoGanho = z.infer<typeof resumoDoGanhoSchema>;

const uuid = z.string().uuid();

/**
 * Dono e participantes do negócio, do "Editar negócio" (0044). Vazio é sem
 * dono; o que não é id de usuário fica de fora.
 */
export function donoEParticipantesDoForm(formData: FormData): {
  owner_id: string | null;
  participantes: string[];
} {
  const dono = formData.get("owner_id");
  return {
    owner_id: uuid.safeParse(dono).success ? (dono as string) : null,
    participantes: formData
      .getAll("participantes")
      .filter((v): v is string => uuid.safeParse(v).success),
  };
}
