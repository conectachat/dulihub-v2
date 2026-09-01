import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Renova o token de sessão a cada requisição e barra acesso não autenticado.
 *
 * Server Components não escrevem cookies, então a renovação precisa acontecer
 * aqui. Sem isto a sessão expira e o usuário é deslogado sozinho.
 *
 * Isto é checagem OTIMISTA, não autorização. A documentação do Next é
 * explícita: proxy não serve como solução de sessão ou autorização. Quem
 * protege de verdade são a RLS no Postgres e o `getUser()` executado no
 * servidor dentro de cada página.
 *
 * No Next 16 esta convenção deixou de se chamar `middleware` e passou a
 * `proxy` — mesmo comportamento, nome novo.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalida o token no servidor de auth. Não troque por
  // getSession(): esse apenas lê o cookie, que o cliente pode forjar.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/proposta") || // link de proposta para o lead
    pathname.startsWith("/agendar"); // página pública de agendamento

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Todas as rotas, menos arquivos estáticos e imagens. Importante manter
     * o proxy fora desses caminhos: rodar em cada asset custa latência.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
