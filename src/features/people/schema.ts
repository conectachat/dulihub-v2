import { z } from "zod";

import { aparar, erroDeContato, normalizarDdi, type CampoDeContato } from "@/lib/contato";

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
 * E-mail, DDI e telefone: aparados pelo mesmo conjunto de espaços do banco
 * (`aparar`), vazio vira `null` — a obrigatoriedade é de `erroDeContato`.
 */
const textoDeContato = z
  .string()
  .nullish()
  .transform((v) => aparar(v));

/** O campo do formulário onde cada erro de contato aparece. */
const CAMPO_DO_FORMULARIO: Record<CampoDeContato, "email" | "phone_country_code" | "phone"> = {
  email: "email",
  ddi: "phone_country_code",
  telefone: "phone",
};

/**
 * Nome, e-mail, DDI e telefone são obrigatórios (decisão de 17/nov, spec
 * §6.1, CON-8).
 *
 * Antes só o nome era: o contato entrava com o que se sabia e ia sendo
 * completado. Mas contato hoje só nasce junto de uma oportunidade, e sem
 * e-mail e telefone não há como avisar que ele já existe (CON-4) — os
 * duplicados eram o defeito maior. Empresa e cargo continuam opcionais.
 *
 * A regra de formato é a de `src/lib/contato.ts`, a mesma do banco
 * (`private.contato_valido`), com as mesmas mensagens. O DDI grava com o "+".
 * Os 4 contatos antigos sem e-mail ou telefone só cobram os campos quando
 * alguém os edita.
 */
export const personSchema = z
  .object({
    full_name: z.string().trim().min(1, "Informe o nome"),
    email: textoDeContato,
    phone_country_code: textoDeContato,
    phone: textoDeContato,
    company: textoOpcional,
    job_title: textoOpcional,
  })
  .superRefine((v, ctx) => {
    const erro = erroDeContato({ email: v.email, ddi: v.phone_country_code, telefone: v.phone });
    if (erro) {
      ctx.addIssue({ code: "custom", path: [CAMPO_DO_FORMULARIO[erro.campo]], message: erro.mensagem });
    }
  })
  .transform((v) => ({ ...v, phone_country_code: normalizarDdi(v.phone_country_code) }));

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

/**
 * Os campos que só o cliente tem no Editar (CLI-10, CLI-12): dono, cliente
 * desde e participantes. Vazio vira nulo; a data não pode ser no futuro (a
 * mesma frase de `marcar_como_cliente`). Quem é membro da organização da
 * pessoa, o banco confere pela chave composta.
 */
export function clienteFromForm(
  formData: FormData,
  hoje: string,
):
  | { ok: true; owner_id: string | null; client_since: string | null; participantes: string[] }
  | { ok: false; erro: string } {
  const texto = (campo: string) => {
    const v = formData.get(campo);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const desde = texto("client_since");
  if (desde !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return { ok: false, erro: "Data de cliente inválida." };
    if (desde > hoje) return { ok: false, erro: "A data de cliente não pode ser no futuro." };
  }

  const participantes = [
    ...new Set(
      formData
        .getAll("participantes")
        .filter((v): v is string => typeof v === "string" && v !== ""),
    ),
  ];

  return { ok: true, owner_id: texto("owner_id"), client_since: desde, participantes };
}
