import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { EmConstrucao } from "@/components/em-construcao";
import { QueryError } from "@/components/query-error";
import { obterProcesso } from "@/features/projects/queries";
import { formatarDia } from "@/lib/formatar";

import { BarraDeProgresso, SeloDoStatus } from "../partes";

export const metadata = { title: "Processo — Duli Hub" };

/**
 * A tela do processo. Neste passo, só o cabeçalho: é para onde a criação
 * leva. Campos do USCIS, etapas e documentos entram nos passos 4 a 6.
 */
export default async function ProcessoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { processo, error } = await obterProcesso(id);

  if (error) return <QueryError detalhe={error} />;
  if (!processo) notFound();

  return (
    <main className="space-y-6 p-6">
      <Link
        href="/projetos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Projetos
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-serif text-2xl font-medium tracking-tight">
            {processo.title}
          </h1>
          <SeloDoStatus status={processo.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {processo.person ? (
            <Link href={`/contatos/${processo.person.id}`} className="hover:underline">
              {processo.person.full_name}
            </Link>
          ) : null}
          {" · "}
          {processo.visto?.name ?? "Tipo de visto removido"} · desde{" "}
          {formatarDia(processo.started_on)}
        </p>
        <BarraDeProgresso progresso={processo.progresso} />
      </header>

      <EmConstrucao
        fase="Fase 2 — próximos passos"
        itens={[
          "Recibo do USCIS, priority date, RFE e datas de envio e decisão",
          "Etapas copiadas do tipo de visto, com status e datas",
          "Pastas exigidas, com prazo, arquivos e marcação de resolvida",
        ]}
      />
    </main>
  );
}
