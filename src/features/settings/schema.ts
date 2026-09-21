import { z } from "zod";

import { parseMoney, parseWholeNumber } from "@/lib/numbers";
import { PALETTE } from "@/lib/palette";

/**
 * O que vale como entrada na Configuração — num lugar só, e puro.
 *
 * Estava dentro dos arquivos `"use server"`, o que bastava enquanto toda
 * gravação acontecia no servidor. Com a gravação offline a mesma validação
 * precisa rodar no navegador, **antes** de a linha entrar na fila: recusar só
 * na hora de subir poria o erro horas depois do dedo que o cometeu, longe de
 * quem poderia corrigi-lo.
 *
 * Nenhuma regra muda aqui. Só mudou de lugar.
 */

export const tagSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da tag").max(40),
  color: z
    .string()
    .trim()
    .refine((c) => (PALETTE as readonly string[]).includes(c), "Cor inválida"),
});

export const documentTypeNameSchema = z.string().trim().min(1, "Informe o nome").max(120);

export const pipelineStageNameSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome da etapa")
  .max(60);

export const stageStatusLabelSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome do status")
  .max(40);

export const stageStatusColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida");

export const visaTypeSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(120),
  description: z.string().trim().optional(),
  base_price: z.string().nullish().transform(parseMoney),
  currency: z.enum(["BRL", "USD"]).default("BRL"),
  estimated_days: z.string().trim().optional().transform(parseWholeNumber),
});

export const visaStageSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da etapa").max(120),
  estimated_days: z.string().trim().optional().transform(parseWholeNumber),
});

/**
 * Identificador estável, derivado do nome só na criação.
 *
 * O `code` é o que o resto do sistema referencia; renomear "Pendente" para
 * "A fazer" não pode mudá-lo, senão relatório e integração passam a apontar
 * para o vazio. Por isso a geração acontece uma vez, na criação, e nunca no
 * rename.
 */
export function toCode(label: string) {
  return (
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || "status"
  );
}
