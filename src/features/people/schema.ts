import { z } from "zod";

/**
 * Campo de texto opcional vindo de formulário.
 *
 * `formData.get()` devolve `null` quando o campo não existe na tela e `""`
 * quando existe e está vazio. Os dois viram `null`, e é `null` de propósito:
 * `undefined` some do objeto, e chave ausente num PATCH do PostgREST significa
 * "não mexa nesta coluna" — foi assim que apagar o email de um contato passou
 * a não apagar nada, com a tela dizendo que salvou.
 */
const textoOpcional = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

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
  email: textoOpcional.refine(
    (v) => v === null || z.string().email().safeParse(v).success,
    { message: "Email inválido" },
  ),
  phone_country_code: textoOpcional,
  phone: textoOpcional,
  company: textoOpcional,
  job_title: textoOpcional,
});

export type PersonInput = z.infer<typeof personSchema>;

/**
 * Traduz o formulário da tela para o objeto que o schema valida.
 *
 * Existe como função exportada, e não inline na Server Action, porque foi
 * exatamente aqui que morou o defeito que impediu criar contato por dois dias:
 * a ação lia um campo `notes` que a tela nunca teve, `formData.get` devolvia
 * `null`, e a validação recusava tudo — em inglês, na cara do usuário.
 *
 * Módulo `"use server"` não pode exportar função síncrona, então enquanto isso
 * viveu dentro da ação era intestável por construção. A lista de campos aqui é
 * a fonte da verdade e tem de bater com a tela.
 */
export function personFromForm(formData: FormData) {
  return personSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    phone_country_code: formData.get("phone_country_code"),
    phone: formData.get("phone"),
    company: formData.get("company"),
    job_title: formData.get("job_title"),
  });
}

export const LIFECYCLE_LABELS: Record<string, string> = {
  contact: "Contato",
  opportunity: "Oportunidade",
  client: "Cliente",
};
