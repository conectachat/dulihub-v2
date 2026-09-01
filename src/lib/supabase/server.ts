import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 *
 * Este é o caminho padrão para ler dados no DuliHub. O dado é buscado no
 * servidor e só o resultado renderizado chega ao navegador — num app que
 * carrega passaporte, comprovante de renda e contrato, isso importa.
 *
 * Sempre crie um cliente novo por requisição. Não exporte uma instância
 * compartilhada: cada requisição tem seus próprios cookies de sessão.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components não podem escrever cookies. O middleware
            // cuida da renovação do token, então ignorar aqui é seguro.
          }
        },
      },
    },
  );
}
