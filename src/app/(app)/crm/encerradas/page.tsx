import Link from "next/link";
import { Archive, ChevronLeft, ChevronRight } from "lucide-react";

import { BuscaNaUrl } from "@/components/busca-na-url";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { QueryError } from "@/components/query-error";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listarEncerradas, type NegocioEncerrado } from "@/features/opportunities/queries";
import { situacaoPedida } from "@/features/opportunities/regras";
import { formatarData } from "@/lib/formatar";
import { contagemDaLista, paginaPedida, POR_PAGINA } from "@/lib/paginacao";
import { formatarPorMoeda } from "@/lib/totals";
import { cn } from "@/lib/utils";

export const metadata = { title: "Oportunidades encerradas — Duli Hub" };

const FILTROS = [
  { valor: undefined, rotulo: "Todas" },
  { valor: "ganha", rotulo: "Ganhas" },
  { valor: "perdida", rotulo: "Perdidas" },
] as const;

/**
 * CRM › Encerradas (CRM-16): ganhas e perdidas saem do quadro depois de 30
 * dias e são achadas aqui — por título ou pelo nome do contato, ganha ou
 * perdida, 50 por página e sempre com o total. O clique abre a tela do
 * negócio, que continua existindo.
 *
 * Lê do servidor, como o resto do CRM (`buscar_encerradas`, 0053).
 */
export default async function EncerradasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; situacao?: string; pagina?: string }>;
}) {
  const { q, situacao: situacaoNaUrl, pagina: paginaNaUrl } = await searchParams;
  const pagina = paginaPedida(paginaNaUrl);
  const situacao = situacaoPedida(situacaoNaUrl);
  const { negocios, total, error } = await listarEncerradas({ busca: q, situacao, pagina });

  const contagem = contagemDaLista({
    total,
    pagina,
    naPagina: negocios.length,
    substantivo: { singular: "oportunidade encerrada", plural: "oportunidades encerradas" },
  });
  const temAnterior = pagina > 1;
  const temProxima = pagina * POR_PAGINA < total;

  const endereco = (mudar: { situacao?: string | undefined; pagina?: number }) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    const s = "situacao" in mudar ? mudar.situacao : situacaoNaUrl;
    if (s === "ganha" || s === "perdida") sp.set("situacao", s);
    const n = mudar.pagina ?? 1;
    if (n > 1) sp.set("pagina", String(n));
    const qs = sp.toString();
    return qs ? `/crm/encerradas?${qs}` : "/crm/encerradas";
  };

  return (
    <main className="space-y-6 p-6">
      <PageHeader
        title="Oportunidades encerradas"
        description="Ganhas e perdidas. O quadro mostra só as dos últimos 30 dias."
        actions={
          <Link
            href="/crm"
            className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-primary hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar ao quadro
          </Link>
        }
      />

      <div className="space-y-3">
        <BuscaNaUrl placeholder="Buscar por título ou contato..." rotulo="Buscar encerradas" />
        <nav className="flex flex-wrap gap-2" aria-label="Situação">
          {FILTROS.map((f) => {
            const ativo =
              (f.valor ?? null) ===
              (situacao === "won" ? "ganha" : situacao === "lost" ? "perdida" : null);
            return (
              <Link
                key={f.rotulo}
                href={endereco({ situacao: f.valor })}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "rounded-xl border px-3 py-1.5 text-sm",
                  ativo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                {f.rotulo}
              </Link>
            );
          })}
        </nav>
      </div>

      {error ? (
        <QueryError title="Não foi possível carregar as encerradas" detalhe={error} />
      ) : negocios.length === 0 ? (
        <EmptyState
          icon={Archive}
          title={
            pagina > 1
              ? "Nenhuma oportunidade nesta página."
              : q
                ? `Nada encontrado para "${q}".`
                : "Nenhuma oportunidade encerrada."
          }
          action={
            pagina > 1 ? (
              <Link
                href={endereco({ pagina: 1 })}
                className="text-sm font-medium text-primary hover:underline"
              >
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
                  <TableHead>Título</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Encerrada em</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {negocios.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell>
                      <Link href={`/crm/${n.id}`} className="font-medium hover:underline">
                        {n.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{n.full_name}</TableCell>
                    <TableCell>
                      <Selo status={n.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {n.closed_at ? formatarData(n.closed_at) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{totalDe(n)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Celular: cada negócio vira um cartão (spec §10). */}
          <ul className="space-y-2 md:hidden">
            {negocios.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/crm/${n.id}`}
                  className="flex items-start gap-3 rounded-2xl border p-4 hover:bg-accent"
                >
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block truncate font-medium">{n.title}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {n.full_name}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Selo status={n.status} />
                      {n.closed_at ? formatarData(n.closed_at) : "—"}
                      <span className="tabular-nums">{totalDe(n)}</span>
                    </span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-primary" />
                </Link>
              </li>
            ))}
          </ul>

          {temAnterior || temProxima ? (
            <nav className="flex items-center justify-between gap-3" aria-label="Páginas">
              {temAnterior ? (
                <Link
                  href={endereco({ pagina: pagina - 1 })}
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
                  href={endereco({ pagina: pagina + 1 })}
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

function Selo({ status }: { status: NegocioEncerrado["status"] }) {
  return status === "won" ? (
    <Badge className="rounded-full bg-success/15 text-success">Ganha</Badge>
  ) : (
    <Badge variant="outline" className="rounded-full">
      Perdida
    </Badge>
  );
}

const totalDe = (n: NegocioEncerrado) => formatarPorMoeda(n.totais) || "—";
