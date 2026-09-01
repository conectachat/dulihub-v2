import { z } from "zod";

/**
 * Só o nome é obrigatório.
 *
 * Um cadastro que exige muito campo não é preenchido — e no app antigo isso
 * produziu contatos pela metade espalhados por três tabelas. Aqui o contato
 * entra com o que se sabe e vai sendo completado; o formulário de onboarding
 * é que exige tudo, na hora certa.
 */
export const personSchema = z.object({
  full_name: z.string().trim().min(1, "Informe o nome"),
  email: z
    .string()
    .trim()
    .email("Email inválido")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  phone_country_code: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  company: z.string().trim().optional(),
  job_title: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type PersonInput = z.infer<typeof personSchema>;

export const LIFECYCLE_LABELS: Record<string, string> = {
  contact: "Contato",
  opportunity: "Oportunidade",
  client: "Cliente",
};
