import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FolderClock,
  ListTodo,
  Wallet,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Alertas } from "@/features/painel/regras";
import { formatarData, formatarDia } from "@/lib/formatar";
import { formatarPorMoeda } from "@/lib/totals";
import { cn } from "@/lib/utils";

/**
 * "Precisa de atenção" — o topo da tela Início.
 *
 * Do mais grave para o menos: prazo de RFE é prazo legal, e perder mata o
 * caso; ficha de cadastro recebida é um cliente pronto para o contrato,
 * esperando por nós; parcela vencida é dinheiro parado; pasta e etapa
 * atrasadas são o processo andando mais devagar do que devia.
 *
 * Bloco sem ocorrência não aparece. Nada vencendo vira uma frase, e não um
 * espaço em branco — em branco, a pessoa não sabe se está tudo em dia ou se
 * a tela não carregou.
 */

function quando(dias: number): string {
  if (dias < -1) return `venceu há ${-dias} dias`;
  if (dias === -1) return "venceu ontem";
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  return `vence em ${dias} dias`;
}

function Bloco({
  titulo,
  icone,
  grave,
  children,
}: {
  titulo: string;
  icone: React.ReactNode;
  grave?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("rounded-3xl", grave && "border-destructive/40")}>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
        <span className={cn("text-primary", grave && "text-destructive")}>{icone}</span>
        <CardTitle className="text-sm font-medium">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function AlertasDoDia({ alertas }: { alertas: Alertas }) {
  if (alertas.vazio) {
    return (
      <p className="flex items-center gap-2 rounded-3xl border p-4 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        Nada vencendo: nenhum prazo de RFE nos próximos 30 dias, nenhuma
        parcela, pasta ou etapa atrasada, e nenhuma ficha de cadastro a conferir.
      </p>
    );
  }

  const { rfe, parcelas, pastas, etapas, fichas } = alertas;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">Precisa de atenção</h2>

      <div className="grid gap-4 lg:grid-cols-2">
        {rfe.length > 0 ? (
          <Bloco
            titulo="Prazo de RFE"
            icone={<CalendarClock className="h-4 w-4" />}
            grave={rfe.some((r) => r.urgente)}
          >
            <ul className="divide-y">
              {rfe.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/projetos/${r.id}`} className="min-w-0 hover:underline">
                    <span className="block truncate text-sm font-medium">{r.cliente}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.title}
                    </span>
                  </Link>
                  <span
                    className={cn(
                      "shrink-0 text-right text-xs",
                      r.urgente ? "font-medium text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {quando(r.dias)}
                    <span className="block">{formatarDia(r.prazo)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Bloco>
        ) : null}

        {fichas.length > 0 ? (
          <Bloco
            titulo="Fichas de cadastro recebidas"
            icone={<ClipboardCheck className="h-4 w-4" />}
          >
            <ul className="divide-y">
              {fichas.map((f) => (
                <li key={f.person_id} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    href={`/contatos/${f.person_id}#dados-cadastrais`}
                    className="min-w-0 hover:underline"
                  >
                    <span className="block truncate text-sm font-medium">{f.nome}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Confira os dados para montar o contrato
                    </span>
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatarData(f.recebidaEm)}
                  </span>
                </li>
              ))}
            </ul>
          </Bloco>
        ) : null}

        {parcelas.quantidade > 0 ? (
          <Bloco titulo="Parcelas vencidas" icone={<Wallet className="h-4 w-4" />} grave>
            <p className="text-lg font-semibold text-destructive">
              {formatarPorMoeda(parcelas.total)}
            </p>
            <p className="text-xs text-muted-foreground">
              {parcelas.quantidade}{" "}
              {parcelas.quantidade === 1 ? "parcela" : "parcelas"} de{" "}
              {parcelas.clientes.length}{" "}
              {parcelas.clientes.length === 1 ? "cliente" : "clientes"}
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {parcelas.clientes.slice(0, 5).map((c) => (
                <li key={c.person_id} className="flex justify-between gap-3">
                  <Link href={`/contatos/${c.person_id}`} className="truncate hover:underline">
                    {c.nome}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {c.quantidade} {c.quantidade === 1 ? "parcela" : "parcelas"}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/financeiro?filtro=vencidas"
              className="mt-2 inline-block text-xs text-primary hover:underline"
            >
              Ver todas no Financeiro
            </Link>
          </Bloco>
        ) : null}

        {pastas.length > 0 ? (
          <Bloco titulo="Pastas com prazo vencido" icone={<FolderClock className="h-4 w-4" />}>
            <ul className="divide-y">
              {pastas.map(({ processo, quantidade }) => (
                <li key={processo.id} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    href={`/projetos/${processo.id}?aba=documentos`}
                    className="min-w-0 hover:underline"
                  >
                    <span className="block truncate text-sm font-medium">{processo.cliente}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {processo.title}
                    </span>
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {quantidade} {quantidade === 1 ? "pasta" : "pastas"}
                  </span>
                </li>
              ))}
            </ul>
          </Bloco>
        ) : null}

        {etapas.length > 0 ? (
          <Bloco
            titulo="Etapas com data prevista vencida"
            icone={<ListTodo className="h-4 w-4" />}
          >
            <ul className="divide-y">
              {etapas.map(({ processo, quantidade }) => (
                <li key={processo.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/projetos/${processo.id}`} className="min-w-0 hover:underline">
                    <span className="block truncate text-sm font-medium">{processo.cliente}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {processo.title}
                    </span>
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {quantidade} {quantidade === 1 ? "etapa" : "etapas"}
                  </span>
                </li>
              ))}
            </ul>
          </Bloco>
        ) : null}
      </div>
    </section>
  );
}
