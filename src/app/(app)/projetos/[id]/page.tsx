import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { QueryError } from "@/components/query-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AbasNaUrl } from "@/components/abas-na-url";
import { TabsContent } from "@/components/ui/tabs";
import { equipeDaOrganizacao, paginaDoProcesso } from "@/features/pages/queries";
import { obterProcesso, pastasDoProcesso } from "@/features/projects/queries";
import { createClient } from "@/lib/supabase/server";
import { formatarDia, hojeEmSaoPaulo } from "@/lib/formatar";
import { enderecoDaPessoa } from "@/lib/pessoa";

import { ProgressoDoProjeto } from "../partes";
import { CampoDoProcesso, StatusDoProcesso } from "./campos-editaveis";
import { DocumentosDoProcesso } from "./documentos";
import { EtapasDoProcesso } from "./etapas";
import { Observacoes } from "./observacoes";

export const metadata = { title: "Processo — Duli Hub" };

/** Os campos de imigração, na ordem em que o caso anda. */
const CAMPOS_DE_DATA = [
  { campo: "filed_on", rotulo: "Enviado ao USCIS" },
  { campo: "priority_date", rotulo: "Priority date" },
  { campo: "rfe_received_on", rotulo: "RFE recebida" },
  { campo: "rfe_due_on", rotulo: "Prazo da RFE" },
  // Preenchida, o prazo da RFE sai dos alertas da tela Início.
  { campo: "rfe_answered_on", rotulo: "Resposta da RFE enviada" },
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

  const supabase = await createClient();
  const [
    { pagina, error: erroPagina },
    { equipe, error: erroEquipe },
    { pastas, error: erroPastas },
    { data: sessao },
  ] = await Promise.all([
    paginaDoProcesso(processo.id, processo.organization_id),
    equipeDaOrganizacao(processo.organization_id),
    pastasDoProcesso(processo.id),
    supabase.auth.getUser(),
  ]);
  const falha = erroPagina ?? erroEquipe ?? erroPastas;
  if (falha) return <QueryError detalhe={falha} />;

  const usuarioId = sessao.user?.id ?? "";
  const usuario = {
    id: usuarioId,
    nome:
      equipe.find((m) => m.id === usuarioId)?.nome ??
      sessao.user?.email ??
      "Você",
  };

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
            <Link
              href={enderecoDaPessoa(processo.person.id, "client", "projetos")}
              className="hover:underline"
            >
              {processo.person.full_name}
            </Link>
          ) : null}
          {" · "}
          {processo.visto?.name ?? "Tipo de visto removido"} · desde{" "}
          {formatarDia(processo.started_on)}
        </p>
        <ProgressoDoProjeto progresso={processo.progresso} className="pt-2" />
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

      {/*
        A aba aberta fica na URL: o alerta de pasta atrasada, na tela Início,
        leva direto aos documentos (`?aba=documentos`).
      */}
      <AbasNaUrl
        padrao="etapas"
        abas={[
          // O mesmo número da barra do cabeçalho — uma conta só.
          {
            valor: "etapas",
            rotulo: `Etapas (${processo.progresso.concluidas}/${processo.progresso.total})`,
          },
          {
            valor: "documentos",
            rotulo: `Documentos (${processo.pastas.resolvidas}/${processo.pastas.total})`,
          },
          { valor: "observacoes", rotulo: "Observações" },
        ]}
      >

        <TabsContent value="etapas" className="pt-4">
          <EtapasDoProcesso
            processoId={processo.id}
            etapas={etapas}
            status={status}
            hoje={hojeEmSaoPaulo()}
          />
        </TabsContent>

        <TabsContent value="documentos" className="pt-4">
          <DocumentosDoProcesso
            processoId={processo.id}
            organizationId={processo.organization_id}
            pastas={pastas}
            hoje={hojeEmSaoPaulo()}
          />
        </TabsContent>

        <TabsContent value="observacoes" className="pt-4">
          {pagina ? (
            <Observacoes
              paginaId={pagina.id}
              organizationId={processo.organization_id}
              projectId={processo.id}
              usuario={usuario}
              equipe={equipe}
              editadoEm={pagina.editada ? pagina.updated_at : null}
              editadoPor={pagina.autor}
            />
          ) : null}
        </TabsContent>
      </AbasNaUrl>
    </main>
  );
}
