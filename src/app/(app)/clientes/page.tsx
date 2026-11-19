import Link from "next/link";
import { ChevronLeft, ChevronRight, UserCheck } from "lucide-react";

import { BuscaNaUrl } from "@/components/busca-na-url";
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
import { listarClientes } from "@/features/clientes/queries";
import { contagemDaLista, paginaPedida, POR_PAGINA } from "@/features/clientes/regras";
import { formatarDia, iniciais, telefoneCompleto } from "@/lib/formatar";

export const metadata = { title: "Clientes — Duli Hub" };

/**
 * A lista de Clientes (CLI-1): quem é cliente e está fora da lixeira, em
 * ordem de nome, 50 por página, sempre com o total.
 *
 * Lê do servidor, como Contatos e CRM — exceção à regra "tela nova nasce
 * migrada", registrada no `AGENTS.md`: o dono vem de `profiles`, que nunca vai
 * ao aparelho.
 */
export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string }>;
}) {
  const { q, pagina: paginaNaUrl } = await searchParams;
  const pagina = paginaPedida(paginaNaUrl);
  const { clientes, total, error } = await listarClientes({ busca: q, pagina });

  const contagem = contagemDaLista({ total, pagina, naPagina: clientes.length });
  const temAnterior = pagina > 1;
  const temProxima = pagina * POR_PAGINA < total;

  const paraPagina = (n: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (n > 1) sp.set("pagina", String(n));
    const qs = sp.toString();
    return qs ? `/clientes?${qs}` : "/clientes";
  };

  return (
    <main className="space-y-6 p-6">
      <PageHeader
        title="Clientes"
        description="Quem já fechou com a Duli: dados, financeiro, processos e documentos."
      />

      <BuscaNaUrl placeholder="Buscar por nome, e-mail ou telefone..." rotulo="Buscar clientes" />

      {error ? (
        <QueryError title="Não foi possível carregar os clientes" detalhe={error} />
      ) : clientes.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title={
            pagina > 1
              ? "Nenhum cliente nesta página."
              : q
                ? `Nenhum cliente encontrado para "${q}".`
                : "Nenhum cliente ainda."
          }
          hint={
            pagina === 1 && !q ? "Um contato vira cliente quando o negócio dele é ganho." : undefined
          }
          action={
            pagina > 1 ? (
              <Link href={paraPagina(1)} className="text-sm font-medium text-primary hover:underline">
                Voltar para a primeira página
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {contagem ? <p className="text-sm text-muted-foreground">{contagem}</p> : null}

          {/* Computador: tabela. */}
          <div className="hidden overflow-x-auto rounded-3xl border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Dono</TableHead>
                  <TableHead>Cliente desde</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Abrir</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                          {iniciais(c.full_name)}
                        </span>
                        <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                          {c.full_name}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {telefoneCompleto(c.phone_country_code, c.phone) ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.dono ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {c.client_since ? formatarDia(c.client_since) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/clientes/${c.id}`}
                        className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent"
                      >
                        Abrir
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Celular: cada cliente vira um cartão (spec §10). */}
          <ul className="space-y-2 md:hidden">
            {clientes.map((c) => {
              const telefone = telefoneCompleto(c.phone_country_code, c.phone);
              return (
                <li key={c.id}>
                  <Link
                    href={`/clientes/${c.id}`}
                    className="flex items-start gap-3 rounded-2xl border p-4 hover:bg-accent"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                      {iniciais(c.full_name)}
                    </span>
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="block truncate font-medium">{c.full_name}</span>
                      {c.email ? (
                        <span className="block truncate text-sm text-muted-foreground">{c.email}</span>
                      ) : null}
                      {telefone ? (
                        <span className="block text-sm text-muted-foreground">{telefone}</span>
                      ) : null}
                      <span className="block text-xs text-muted-foreground">
                        Dono: {c.dono ?? "—"} · Cliente desde{" "}
                        {c.client_since ? formatarDia(c.client_since) : "—"}
                      </span>
                    </span>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  </Link>
                </li>
              );
            })}
          </ul>

          {temAnterior || temProxima ? (
            <nav className="flex items-center justify-between gap-3" aria-label="Páginas">
              {temAnterior ? (
                <Link
                  href={paraPagina(pagina - 1)}
                  className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-primary hover:bg-accent"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Link>
              ) : (
                <span />
              )}
              {temProxima ? (
                <Link
                  href={paraPagina(pagina + 1)}
                  className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-primary hover:bg-accent"
                >
                  Próxima
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      )}
    </main>
  );
}
