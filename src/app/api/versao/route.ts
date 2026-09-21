import { NextResponse } from "next/server";

import { VERSAO } from "@/lib/versao";

/**
 * Versão publicada e o interruptor de emergência do service worker.
 *
 * O app antigo precisou publicar um service worker "desligador" quando o
 * cache dele prendeu arquivos velhos — e para isso dependeu de um deploy.
 * Aqui o desligamento é uma variável de ambiente: pôr `SW_DESLIGAR=1` na
 * Vercel faz cada navegador, na próxima abertura, apagar os caches e
 * desregistrar o worker. Sem publicar código.
 *
 * Nunca entra em cache: é o jeito de desligar o cache.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { versao: VERSAO, desligar: process.env.SW_DESLIGAR === "1" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
