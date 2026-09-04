import Link from "next/link";
import { Compass } from "lucide-react";

/**
 * Endereço que não existe — e também o que `notFound()` mostra quando a RLS
 * esconde um registro.
 *
 * O texto não distingue os dois casos de propósito: dizer "existe, mas não é
 * seu" já entrega que existe. Ver `contatos/[id]/page.tsx`, onde essa decisão
 * está registrada.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-3xl border bg-card p-6 text-center shadow-sm">
        <Compass className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden />
        <h1 className="font-serif text-xl font-medium">Página não encontrada</h1>
        <p className="text-sm text-muted-foreground">
          O endereço não existe, ou o registro não está disponível para a sua
          conta.
        </p>
        <Link
          href="/"
          className="inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
