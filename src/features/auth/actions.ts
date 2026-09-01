"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Informe a senha"),
});

export type AuthState = { error: string | null };

/**
 * Autentica e devolve o usuário para a rota que ele tentou acessar.
 *
 * Roda no servidor: a senha nunca fica em estado de componente nem trafega
 * para o Supabase a partir do navegador.
 */
export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Mensagem genérica de propósito: distinguir "email não existe" de
    // "senha errada" entrega a atacantes quais emails têm conta.
    return { error: "Email ou senha incorretos." };
  }

  const next = formData.get("next");
  const target = typeof next === "string" && next.startsWith("/") ? next : "/";

  revalidatePath("/", "layout");
  redirect(target);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
