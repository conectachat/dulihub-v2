import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, FileStack } from "lucide-react";

import { ConfirmAction } from "@/components/confirm-action";
import { QueryError } from "@/components/query-error";
import { EmptyState } from "@/components/empty-state";
import { SectionHeader } from "@/components/page-header";
import { EmConstrucao } from "@/components/em-construcao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getUserContext } from "@/features/organizations/queries";
import { deleteVisaType } from "@/features/settings/visa-type-actions";
import { ALL_SECTIONS, findSection } from "@/features/settings/sections";
import {
  catalogoDeDocumentos,
  etapasDoFunil,
  statusDeEtapa,
  tagsComContagem,
  tipoDeVisto,
  tiposDeVisto,
} from "@/features/settings/queries";
import { VERSAO } from "@/lib/versao";

import { DocumentTypesEditor } from "./document-types-editor";
import { VersaoDoApp } from "./versao-do-app";
import { StageStatusesEditor } from "./stage-statuses-editor";
import { StagesEditor } from "./stages-editor";
import { TagsEditor } from "./tags-editor";
import { VisaDocumentsEditor } from "./visa-documents-editor";
import { VisaStagesEditor } from "./visa-stages-editor";
import { VisaTypeDialog } from "./visa-type-dialog";

export function generateStaticParams() {
  return ALL_SECTIONS.map((s) => ({ section: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const found = findSection(section);
  return { title: `${found?.label ?? "Configuração"} — Duli Hub` };
}

/** Perfil e organização. Leitura por enquanto; edição entra na Fase 4. */
async function GeneralSection() {
  const context = await getUserContext();
  if (!context) return null;

  const org = context.organizations[0];

  const rows = [
    { label: "Nome", value: context.fullName ?? "—" },
    { label: "Email", value: context.email },
    { label: "Organização", value: org?.name ?? "—" },
    {
      label: "Papel",
      value:
        org?.role === "owner"
          ? "Proprietário"
          : org?.role === "admin"
            ? "Administrador"
            : org?.role === "staff"
              ? "Colaborador"
              : "—",
    },
  ];

  return (
    <div className="space-y-6">
      <dl className="divide-y rounded-2xl border">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
          >
            <dt className="text-sm text-muted-foreground">{row.label}</dt>
            <dd className="text-sm font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>

      <VersaoDoApp versao={VERSAO} />

      <p className="text-sm text-muted-foreground">
        Editar nome e trocar senha entram junto com a gestão de usuários, na
        Fase 4. Por enquanto a troca de senha é feita pelo painel do Supabase.
      </p>
    </div>
  );
}

/** Etapas do funil, com contagem de negócios em cada uma. */
async function StagesSection() {
  const { funil, etapas, error } = await etapasDoFunil();

  if (error) return <QueryError detalhe={error} />;

  if (!funil) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum funil configurado nesta organização.
      </p>
    );
  }

  return <StagesEditor pipelineId={funil.id} stages={etapas} />;
}

/** Tags da organização, com quantos contatos usam cada uma. */
async function TagsSection() {
  const { tags, error } = await tagsComContagem();

  if (error) return <QueryError detalhe={error} />;

  return <TagsEditor tags={tags} />;
}

/** Catálogo de documentos: árvore de grupos, subgrupos e documentos. */
async function DocumentTypesSection() {
  const { pastas, usos, error } = await catalogoDeDocumentos();

  if (error) return <QueryError detalhe={error} />;

  return <DocumentTypesEditor nodes={pastas} usos={usos} />;
}

/** Status que uma etapa de processo pode assumir. */
async function StageStatusesSection() {
  const { status, error } = await statusDeEtapa();

  if (error) return <QueryError detalhe={error} />;

  return <StageStatusesEditor statuses={status} />;
}

/**
 * Tipos de visto: lista ou detalhe, conforme `?visa=<id>`.
 *
 * Parâmetro em vez de rota aninhada porque a casca das configurações usa
 * `[section]` — criar `/configuracoes/tipos-de-visto/[id]` colidiria com ela.
 * O endereço continua compartilhável.
 */
async function VisaTypesSection({ visaId }: { visaId?: string }) {
  if (visaId) {
    const { visto, etapas, catalogo, exigencias, error } = await tipoDeVisto(visaId);

    // Leitura falha não é "não encontrado", e catálogo falho não é catálogo
    // vazio — as duas confusões levam a recriar o que já existe.
    if (error) return <QueryError detalhe={error} />;

    if (!visto) {
      return (
        <p className="text-sm text-muted-foreground">
          Tipo de visto não encontrado.{" "}
          <Link href="/configuracoes/tipos-de-visto" className="underline">
            Voltar à lista
          </Link>
          .
        </p>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/configuracoes/tipos-de-visto"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Todos os tipos
          </Link>
          <VisaTypeDialog visaType={visto} />
        </div>

        <div>
          <h3 className="text-lg font-semibold">{visto.name}</h3>
          {visto.description ? (
            <p className="text-sm text-muted-foreground">{visto.description}</p>
          ) : null}
        </div>

        <Tabs defaultValue="etapas">
          <TabsList className="rounded-2xl">
            <TabsTrigger value="etapas" className="rounded-xl">
              Etapas ({etapas.length})
            </TabsTrigger>
            <TabsTrigger value="documentos" className="rounded-xl">
              Documentos ({exigencias.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="etapas" className="pt-4">
            <VisaStagesEditor visaTypeId={visaId} stages={etapas} />
          </TabsContent>

          <TabsContent value="documentos" className="pt-4">
            <VisaDocumentsEditor
              visaTypeId={visaId}
              catalog={catalogo}
              selections={exigencias}
            />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  const { tipos, etapasPorTipo, documentosPorTipo, error } = await tiposDeVisto();

  // Sem isto, uma leitura falha vira "Nenhum tipo de visto ainda. Crie o
  // primeiro" — convite para recriar o molde inteiro em cima do que existe.
  if (error) return <QueryError detalhe={error} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <VisaTypeDialog />
      </div>

      {tipos.length === 0 ? (
        <EmptyState
          icon={FileStack}
          title="Nenhum tipo de visto ainda"
          hint="Crie o primeiro — EB-1A, EB-2 NIW, O-1."
        />
      ) : (
        <ul className="space-y-2">
          {tipos.map((type) => (
            <li
              key={type.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{type.name}</p>
                <p className="text-xs text-muted-foreground">
                  {etapasPorTipo[type.id] ?? 0} etapas ·{" "}
                  {documentosPorTipo[type.id] ?? 0} documentos
                  {type.estimated_days ? ` · ${type.estimated_days} dias` : ""}
                </p>
              </div>

              {!type.is_active ? (
                <Badge variant="secondary">Inativo</Badge>
              ) : null}

              {/*
                Botão com rótulo, não o nome virando link: o molde de etapas e
                documentos é o principal desta tela, e nome sublinhado no hover
                não anuncia que existe uma tela inteira atrás dele.
              */}
              <Button asChild variant="outline" size="sm" className="rounded-xl">
                <Link href={`/configuracoes/tipos-de-visto?visa=${type.id}`}>
                  Etapas e documentos
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>

              <VisaTypeDialog visaType={type} />

              <ConfirmAction
                action={deleteVisaType}
                hidden={{ id: type.id }}
                title={`Excluir o tipo de visto “${type.name}”?`}
                consequence={`O molde inteiro vai junto: ${
                  etapasPorTipo[type.id] ?? 0
                } etapas e ${
                  documentosPorTipo[type.id] ?? 0
                } pastas exigidas. Processos já criados a partir dele não são afetados — a cópia dentro do processo é independente. Não dá para desfazer.`}
                confirmLabel="Excluir o molde"
                triggerLabel={`Excluir ${type.name}`}
                needsConfirmation={
                  (etapasPorTipo[type.id] ?? 0) +
                    (documentosPorTipo[type.id] ?? 0) >
                  0
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function SettingsSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ visa?: string }>;
}) {
  const [{ section }, { visa }] = await Promise.all([params, searchParams]);
  const found = findSection(section);
  if (!found) notFound();

  return (
    <div className="space-y-6 p-6">
      <SectionHeader title={found.label} description={found.description} />

      {found.slug === "geral" ? (
        <GeneralSection />
      ) : found.slug === "etapas-do-funil" ? (
        <StagesSection />
      ) : found.slug === "tags" ? (
        <TagsSection />
      ) : found.slug === "categorias-de-documento" ? (
        <DocumentTypesSection />
      ) : found.slug === "tipos-de-visto" ? (
        <VisaTypesSection visaId={visa} />
      ) : found.slug === "status-de-etapas" ? (
        <StageStatusesSection />
      ) : (
        <EmConstrucao fase={found.phase} itens={found.planned} />
      )}
    </div>
  );
}
