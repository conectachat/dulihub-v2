import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Abre um arquivo colado nas Observações.
 *
 * O nó do editor guarda este endereço, não uma URL assinada — assinatura
 * expira, e a imagem sumiria da página. A cada abertura: sessão de quem pede,
 * assinatura de um minuto gerada **com a RLS dele** (a policy do bucket
 * `observacoes` confere a organização pela primeira pasta), e redireciona.
 *
 * Arquivo de outra organização dá 404, igual a arquivo que não existe.
 */
export async function GET(request: NextRequest) {
  const caminho = request.nextUrl.searchParams.get("c");
  if (!caminho || caminho.includes("..") || caminho.split("/").length !== 3) {
    return new NextResponse(null, { status: 404 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("observacoes")
    .createSignedUrl(caminho, 60);

  if (error || !data) return new NextResponse(null, { status: 404 });

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    // A assinatura dura um minuto: o navegador não pode guardar o
    // redirecionamento além disso.
    headers: { "Cache-Control": "private, max-age=30" },
  });
}
