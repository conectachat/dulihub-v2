import { z } from "zod";

import { aparar, erroDeContato, normalizarDdi, type CampoDeContato } from "@/lib/contato";
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

const LONGO = "Texto longo demais em um dos campos.";

/** Aparado, vazio vira nulo, com limite. */
const textoDoParceiro = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => aparar(v))
    .refine((v) => v === null || v.length <= max, LONGO);

/** Obrigatório: aparado, com a frase de quando falta. */
const obrigatorioDoParceiro = (max: number, falta: string) =>
  z
    .string()
    .nullish()
    .transform((v) => aparar(v) ?? "")
    .pipe(z.string().min(1, falta).max(max, LONGO));

const CAMPO_DO_CONTATO: Record<CampoDeContato, "email" | "phone_country_code" | "phone"> = {
  email: "email",
  ddi: "phone_country_code",
  telefone: "phone",
};

/**
 * O parceiro (PAR-4): as mesmas regras de `organizations_regra_do_parceiro`
 * (0068), no navegador, antes de a gravação entrar na fila. Nome e país
 * obrigatórios; contato completo e válido pela regra de `contato_valido`;
 * documento fiscal até 50 e o resto até 200.
 */
export const parceiroSchema = z
  .object({
    name: obrigatorioDoParceiro(200, "Informe o nome do parceiro."),
    legal_name: textoDoParceiro(200),
    address_country: obrigatorioDoParceiro(200, "Informe o país."),
    tax_id: textoDoParceiro(50),
    address_street: textoDoParceiro(200),
    address_number: textoDoParceiro(200),
    address_complement: textoDoParceiro(200),
    address_district: textoDoParceiro(200),
    address_city: textoDoParceiro(200),
    address_state: textoDoParceiro(200),
    address_postal_code: textoDoParceiro(200),
    email: z.string().nullish().transform((v) => aparar(v)),
    phone_country_code: z.string().nullish().transform((v) => aparar(v)),
    phone: z.string().nullish().transform((v) => aparar(v)),
  })
  .superRefine((v, ctx) => {
    const erro = erroDeContato({ email: v.email, ddi: v.phone_country_code, telefone: v.phone });
    if (erro) {
      ctx.addIssue({ code: "custom", path: [CAMPO_DO_CONTATO[erro.campo]], message: erro.mensagem });
    }
  })
  .transform((v) => ({ ...v, phone_country_code: normalizarDdi(v.phone_country_code) }));

export type DadosDoParceiro = z.output<typeof parceiroSchema>;
