import Link from "next/link";
import { X } from "lucide-react";

import { SettingsNav } from "./settings-nav";

/**
 * Casca das configurações: painel sobreposto com barra lateral própria.
 *
 * É rota, não estado de componente. Assim cada seção tem endereço próprio, o
 * botão voltar do navegador funciona, e dá para mandar link direto para uma
 * configuração específica. O visual de janela sobreposta é cosmético — o
 * comportamento é de página.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="p-3 md:p-6">
      <div className="mx-auto flex max-h-[calc(100svh-3rem)] max-w-5xl overflow-hidden rounded-3xl border bg-card shadow-lg">
        <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r bg-muted/30 sm:flex">
          <div className="px-6 pb-2 pt-5">
            <h1 className="text-lg font-semibold">Configurações</h1>
          </div>
          <SettingsNav />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-end border-b px-4 py-3">
            <Link
              href="/"
              aria-label="Fechar configurações"
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-primary transition-colors hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </Link>
          </div>

          <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>

      {/* Em telas estreitas a lateral não cabe: a navegação vira lista rolável. */}
      <div className="mx-auto mt-3 max-w-5xl sm:hidden">
        <div className="overflow-hidden rounded-3xl border bg-card">
          <SettingsNav />
        </div>
      </div>
    </div>
  );
}
