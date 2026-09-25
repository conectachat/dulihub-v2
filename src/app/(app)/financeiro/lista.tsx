"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, TriangleAlert, Wallet } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { SeloPendente } from "@/components/selo-pendente";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { parcelasDoAparelho } from "@/features/financeiro/consultas-locais";
import { recebidoNoMes, situacaoDaParcela } from "@/features/financeiro/regras";
import { ROTULO_DO_METODO } from "@/features/financeiro/schema";
import { formatarDia, hojeEmSaoPaulo } from "@/lib/formatar";
import { useSincronia } from "@/lib/local/estado";
import { bancoDoUsuario, filaDoUsuario } from "@/lib/local/sincronizador";
import { useUsuarioLocal } from "@/lib/local/usuario";
import { formatarMoeda, formatarPorMoeda, somarPorMoeda } from "@/lib/totals";
import { cn } from "@/lib/utils";

/**
 * O a receber de todo mundo, lido do aparelho.
 *
 * Abre com ou sem internet, pelo mesmo caminho — e é por isso que a página
 * não traz dado nenhum no HTML.
 *
 * Os números do topo vêm em duas unidades diferentes de propósito: **a
 * receber e vencido, por moeda**, porque converter uma dívida futura exigiria
 * inventar a cotação do dia em que ela for paga; e **recebido no mês, em
 * real**, porque aí a cotação existe — é a do dia em que o dinheiro entrou, e
 * está guardada na parcela.
 */

type Filtro = "todas" | "vencidas" | "a-vencer" | "pagas";

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "vencidas", rotulo: "Vencidas" },
  { valor: "a-vencer", rotulo: "A vencer" },
  { valor: "pagas", rotulo: "Pagas" },
];

function Numero({
  rotulo,
  valor,
  destaque,
  detalhe,
}: {
  rotulo: string;
  valor: string;
  destaque?: "vencido" | "recebido";
  detalhe?: string;
}) {
  return (
    <div className="rounded-2xl border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold",
          destaque === "vencido" && "text-destructive",
          destaque === "recebido" && "text-success",
        )}
      >
        {valor}
      </p>
      {detalhe ? <p className="text-xs text-muted-foreground">{detalhe}</p> : null}
    </div>
  );
}

export function ListaDoFinanceiro() {
  const { userId, carregado } = useUsuarioLocal();
  const { em } = useSincronia();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busca, setBusca] = useState("");

  const hoje = hojeEmSaoPaulo();

  const parcelas = useLiveQuery(
    () =>
      userId
        ? parcelasDoAparelho(bancoDoUsuario(userId), filaDoUsuario(userId))
        : Promise.resolve([]),
    [userId],
  );

  if (!carregado) return null;

  if (!userId) {
    return (
      <p className="py-6 text-sm text-destructive">
        Sua sessão terminou neste aparelho. Entre de novo para ver o financeiro.
      </p>
    );
  }

  if (!parcelas) return null;

  if (parcelas.length === 0) {
    return (
      <>
        {em ? null : (
          <p className="pb-4 text-sm text-muted-foreground">
            Este aparelho ainda não baixou o financeiro. Conecte-se uma vez para
            poder usá-lo sem internet.
          </p>
        )}
        <EmptyState
          icon={Wallet}
          title="Nenhuma cobrança ainda"
          hint="As cobranças nascem na ficha do cliente, junto com as parcelas."
        />
      </>
    );
  }

  const abertas = parcelas.filter((p) => !p.paid_on);
  const vencidas = abertas.filter((p) => situacaoDaParcela(p, hoje) === "vencida");
  const mes = hoje.slice(0, 7);
  const recebido = recebidoNoMes(parcelas, mes);

  const termo = busca.trim().toLowerCase();
  const visiveis = parcelas.filter((p) => {
    const situacao = situacaoDaParcela(p, hoje);
    if (filtro === "vencidas" && situacao !== "vencida") return false;
    if (filtro === "a-vencer" && situacao !== "pendente") return false;
    if (filtro === "pagas" && situacao !== "paga") return false;

    if (!termo) return true;
    return (
      p.cliente.toLowerCase().includes(termo) || p.cobranca.toLowerCase().includes(termo)
    );
  });

  const porMoeda = (lista: typeof parcelas) =>
    somarPorMoeda(lista.map((p) => ({ value: p.amount, currency: p.currency })));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Numero
          rotulo="A receber"
          valor={formatarPorMoeda(porMoeda(abertas)) || "—"}
          detalhe={`${abertas.length} ${abertas.length === 1 ? "parcela" : "parcelas"}`}
        />
        <Numero
          rotulo="Vencido"
          valor={formatarPorMoeda(porMoeda(vencidas)) || "—"}
          destaque={vencidas.length > 0 ? "vencido" : undefined}
          detalhe={`${vencidas.length} ${vencidas.length === 1 ? "parcela" : "parcelas"}`}
        />
        <Numero
          rotulo="Recebido neste mês"
          valor={formatarMoeda(recebido.total, "BRL")}
          destaque="recebido"
          detalhe={
            recebido.semCotacao > 0
              ? `${recebido.semCotacao} em dólar sem cotação, fora da soma`
              : "Em real, pela cotação de cada pagamento"
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por cliente ou cobrança"
            aria-label="Buscar no financeiro"
            className="rounded-xl pl-9"
          />
        </div>
        {FILTROS.map((f) => (
          <Button
            key={f.valor}
            type="button"
            variant={filtro === f.valor ? "default" : "outline"}
            size="sm"
            className="rounded-xl"
            onClick={() => setFiltro(f.valor)}
          >
            {f.rotulo}
          </Button>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          Nenhuma parcela com esse filtro.
        </p>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {visiveis.map((p) => {
            const situacao = situacaoDaParcela(p, hoje);
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/contatos/${p.person_id}`}
                    className="block truncate font-medium hover:underline"
                  >
                    {p.cliente}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.cobranca} · parcela {p.number} ·{" "}
                    {ROTULO_DO_METODO[p.method as keyof typeof ROTULO_DO_METODO] ?? p.method}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <SeloPendente pendente={p.pendente} conflito={p.conflito} />
                  <span
                    className={cn(
                      "text-xs",
                      situacao === "vencida" && "text-destructive",
                      situacao === "paga" && "text-success",
                      situacao === "pendente" && "text-muted-foreground",
                    )}
                  >
                    {situacao === "paga"
                      ? `Pago ${p.paid_on ? formatarDia(p.paid_on) : ""}`
                      : `${situacao === "vencida" ? "Venceu" : "Vence"} ${formatarDia(p.due_on)}`}
                  </span>
                  <strong className="text-sm">{formatarMoeda(p.amount, p.currency)}</strong>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {recebido.semCotacao > 0 ? (
        <p className="flex items-center gap-2 text-xs text-destructive">
          <TriangleAlert className="h-3 w-3 shrink-0" />
          Há pagamento em dólar sem a cotação do dia. Ele não entra no total
          recebido — somar dólar como se fosse real seria pior.
        </p>
      ) : null}
    </div>
  );
}
