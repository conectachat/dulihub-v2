import { z } from "zod";

/**
 * Formulário de novo processo e o que a lista precisa mostrar.
 *
 * Fora do módulo de ações pela mesma razão de `people/schema.ts`: arquivo
 * `"use server"` só exporta função assíncrona, e o que não se exporta não se
 * testa. Testado em `schema.test.ts`.
 */

/** Os status que o check de `projects.status` aceita, com nome para a tela. */
export const STATUS_DO_PROCESSO = {
  active: "Em andamento",
  filed: "Protocolado",
  approved: "Aprovado",
  denied: "Negado",
  closed: "Encerrado",
} as const;

export type StatusDoProcesso = keyof typeof STATUS_DO_PROCESSO;

export const processoSchema = z.object({
  person_id: z.string().uuid("Contato não informado"),
  visa_type_id: z.string().uuid("Escolha o tipo de visto"),
  title: z.string().trim().min(1, "Informe um título"),
  // Vazio e ausente viram nulo: "" iria ao banco como uuid inválido.
  opportunity_id: z
    .string()
    .nullish()
    .transform((v) => (v ? v : null))
    .pipe(z.string().uuid("Negócio inválido").nullable()),
});

export type ProcessoInput = z.infer<typeof processoSchema>;

/** A lista de campos aqui é a da tela (`novo-processo-dialog.tsx`). */
export function processoFromForm(formData: FormData) {
  return processoSchema.safeParse({
    person_id: formData.get("person_id"),
    visa_type_id: formData.get("visa_type_id"),
    title: formData.get("title"),
    opportunity_id: formData.get("opportunity_id"),
  });
}

/** Título que o diálogo propõe; quem cria pode trocar. */
export function tituloSugerido(visto: string | null, pessoa: string): string {
  return visto ? `${visto} · ${pessoa}` : pessoa;
}

/**
 * O prazo que importa na lista: o mais cedo entre as pastas ainda em aberto.
 *
 * Datas `AAAA-MM-DD` comparam certo como texto — sem `Date`, sem fuso.
 */
export function proximoPrazo(
  pastas: { deadline_on: string | null; resolved_at: string | null }[],
): string | null {
  let menor: string | null = null;
  for (const p of pastas) {
    if (p.resolved_at !== null || p.deadline_on === null) continue;
    if (menor === null || p.deadline_on < menor) menor = p.deadline_on;
  }
  return menor;
}
