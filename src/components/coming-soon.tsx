import { EmConstrucao } from "@/components/em-construcao";
import { PageHeader } from "@/components/page-header";

/**
 * Página de nível superior ainda não construída — Projetos, Financeiro.
 *
 * É só o cabeçalho de página em volta de `EmConstrucao`. As seções de
 * Configurações usam `EmConstrucao` direto, porque o cabeçalho delas já vem
 * do layout de configurações.
 */
export function ComingSoon({
  title,
  description,
  phase,
  items,
}: {
  title: string;
  description: string;
  phase: string;
  items: string[];
}) {
  return (
    <main className="space-y-6 p-6">
      <PageHeader title={title} description={description} />
      <EmConstrucao fase={phase} itens={items} />
    </main>
  );
}
