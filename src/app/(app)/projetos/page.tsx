import Link from "next/link";
import { FolderKanban } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { QueryError } from "@/components/query-error";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listarProcessos } from "@/features/projects/queries";
import { formatarDia, hojeEmSaoPaulo } from "@/lib/formatar";

import { BarraDeProgresso, SeloDoStatus } from "./partes";

export const metadata = { title: "Projetos — Duli Hub" };

export default async function ProjetosPage() {
  const { processos, error } = await listarProcessos();

  // Compara com o prazo como texto: os dois são `AAAA-MM-DD`.
  const hoje = hojeEmSaoPaulo();

  return (
    <main className="space-y-6 p-6">
      <PageHeader
        title="Projetos"
        description="Processos de visto em andamento: etapas, pastas e prazos."
      />

      {error ? (
        <QueryError title="Não foi possível carregar os processos" detalhe={error} />
      ) : processos.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Nenhum processo ainda."
          hint="O processo nasce na ficha do contato, em Processos › Novo processo."
        />
      ) : (
        <div className="rounded-3xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Processo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pastas</TableHead>
                <TableHead>Próximo prazo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {processos.map((p) => {
                const atrasado = p.proximoPrazo !== null && p.proximoPrazo < hoje;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      {p.person ? (
                        <Link
                          href={`/contatos/${p.person.id}`}
                          className="hover:underline"
                        >
                          {p.person.full_name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/projetos/${p.id}`}
                        className="font-medium hover:underline"
                      >
                        {p.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {p.visto?.name ?? "Tipo de visto removido"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <SeloDoStatus status={p.status} />
                    </TableCell>
                    <TableCell>
                      <BarraDeProgresso progresso={p.progresso} />
                    </TableCell>
                    <TableCell
                      className={atrasado ? "font-medium text-destructive" : undefined}
                    >
                      {p.proximoPrazo ? formatarDia(p.proximoPrazo) : "—"}
                      {atrasado ? " · vencido" : ""}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
