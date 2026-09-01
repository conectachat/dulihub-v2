import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para Client Components — roda no navegador.
 *
 * Use apenas onde a interatividade exige (formulários com estado local,
 * realtime, upload com progresso). Para leitura de dados, prefira o cliente
 * de servidor: dado sensível não precisa passar pelo navegador.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
