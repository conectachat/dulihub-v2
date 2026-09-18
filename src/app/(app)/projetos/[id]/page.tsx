import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { EmConstrucao } from "@/components/em-construcao";
import { QueryError } from "@/components/query-error";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { obterProcesso } from "@/features/projects/queries";
import { formatarDia } from "@/lib/formatar";
import { flattenTree, indentStyle } from "@/lib/tree";

import { BarraDeProgresso } from "../partes";
import {
  CampoDoProcesso,
  StatusDaEtapa,
  StatusDoProcesso,
} from "./campos-editaveis";

export const metadata = { title: "Processo — Duli Hub" };

/** Os campos de imigração, na ordem em que o caso anda. */
const CAMPOS_DE_DATA = [
  { campo: "filed_on", rotulo: "Enviado ao USCIS" },
  { campo: "priority_date", rotulo: "Priority date" },
  { campo: "rfe_received_on", rotulo: "RFE recebida" },
  { campo: "rfe_due_on", rotulo: "Prazo da RFE" },
  { campo: "decided_on", rotulo: "Decisão" },
  { campo: "expected_on", rotulo: "Previsão de conclusão" },
] as const;

export default async function ProcessoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { processo, etapas, status, error } = await obterProcesso(id);

  if (error) return <QueryError detalhe={error} />;
  if (!processo) notFound();

  const arvore = flattenTree(etapas);
  const concluidas = etapas.filter(
    (e) => status.find((s) => s.id === e.status_id)?.is_done,
  ).length;

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
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-2xl font-medium tracking-tight">
            {processo.title}
          </h1>
          <StatusDoProcesso processoId={processo.id} status={processo.status} />
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">USCIS</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CampoDoProcesso
            processoId={processo.id}
            campo="uscis_receipt_number"
            valor={processo.uscis_receipt_number}
            tipo="texto"
            rotulo="Recibo (receipt number)"
            placeholder="IOE0912345678"
          />
          {CAMPOS_DE_DATA.map(({ campo, rotulo }) => (
            <CampoDoProcesso
              key={campo}
              processoId={processo.id}
              campo={campo}
              valor={processo[campo]}
              tipo="data"
              rotulo={rotulo}
            />
          ))}
        </CardContent>
      </Card>

      <Tabs defaultValue="etapas">
        <TabsList className="rounded-2xl">
          <TabsTrigger value="etapas" className="rounded-xl">
            Etapas ({concluidas}/{etapas.length})
          </TabsTrigger>
          <TabsTrigger value="documentos" className="rounded-xl">
            Documentos ({processo.progresso.resolvidas}/{processo.progresso.total})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="etapas" className="pt-4">
          {arvore.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              O tipo de visto não tinha etapas quando o processo foi criado.
            </p>
          ) : (
            <ul className="space-y-1">
              {arvore.map((etapa) => (
                <li
                  key={etapa.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-2"
                  style={indentStyle(etapa.depth)}
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {etapa.name}
                      {!etapa.is_required ? (
                        <Badge variant="outline" className="font-normal">
                          opcional
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        etapa.estimated_days
                          ? `previsão de ${etapa.estimated_days} dias`
                          : null,
                        etapa.started_on
                          ? `início ${formatarDia(etapa.started_on)}`
                          : null,
                        etapa.completed_on
                          ? `concluída ${formatarDia(etapa.completed_on)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "não iniciada"}
                    </p>
                  </div>
                  <StatusDaEtapa
                    etapaId={etapa.id}
                    statusId={etapa.status_id}
                    opcoes={status}
                    nomeDaEtapa={etapa.name}
                  />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="documentos" className="pt-4">
          <EmConstrucao
            fase="Fase 2 — próximo passo"
            itens={[
              "Pastas exigidas pelo visto, com prazo e marcação de resolvida",
              "Pasta extra só neste processo",
              "Enviar, abrir, aprovar e recusar arquivos com motivo",
            ]}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
