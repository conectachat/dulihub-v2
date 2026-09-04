import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, FileStack } from "lucide-react";

import { ConfirmAction } from "@/components/confirm-action";
import { QueryError } from "@/components/query-error";
import { EmptyState } from "@/components/empty-state";
import { SectionHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getUserContext } from "@/features/organizations/queries";
import { deleteVisaType } from "@/features/settings/visa-type-actions";
import { ALL_SECTIONS, findSection } from "@/features/settings/sections";
import { createClient } from "@/lib/supabase/server";

import { DocumentTypesEditor } from "./document-types-editor";
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

      <p className="text-sm text-muted-foreground">
        Editar nome e trocar senha entram junto com a gestão de usuários, na
        Fase 4. Por enquanto a troca de senha é feita pelo painel do Supabase.
      </p>
    </div>
  );
}

/** Etapas do funil, com contagem de negócios em cada uma. */
async function StagesSection() {
  const supabase = await createClient();

  const { data: pipeline, error: pipelineError } = await supabase
    .from("pipelines")
    .select("id, name")
    .eq("is_default", true)
    .maybeSingle();

  // Erro antes de vazio, sempre: leitura falha não é "organização sem funil".
  if (pipelineError) {
    return <QueryError detalhe={pipelineError.message} />;
  }

  if (!pipeline) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum funil configurado nesta organização.
      </p>
    );
  }

  const [
    { data: stagesData, error: stagesError },
    { data: opportunities, error: countError },
  ] = await Promise.all([
    supabase
      .from("pipeline_stages")
      .select("id, name, position, is_won, is_lost")
      .eq("pipeline_id", pipeline.id)
      .order("position"),
    supabase.from("opportunities").select("stage_id"),
  ]);

  // A contagem também: com ela zerada por erro, toda etapa parece vazia e
  // segura de excluir.
  const falha = stagesError ?? countError;
  if (falha) return <QueryError detalhe={falha.message} />;

  const counts = new Map<string, number>();
  for (const row of opportunities ?? []) {
    counts.set(row.stage_id, (counts.get(row.stage_id) ?? 0) + 1);
  }

  const stages = (stagesData ?? []).map((s) => ({
    ...s,
    opportunity_count: counts.get(s.id) ?? 0,
  }));

  return <StagesEditor pipelineId={pipeline.id} stages={stages} />;
}

/** Tags da organização, com quantos contatos usam cada uma. */
async function TagsSection() {
  const supabase = await createClient();

  const [
    { data: tagsData, error: tagsError },
    { data: assignments, error: assignmentsError },
  ] = await Promise.all([
    supabase.from("tags").select("id, name, color").order("name"),
    supabase.from("person_tags").select("tag_id"),
  ]);

  const falha = tagsError ?? assignmentsError;
  if (falha) return <QueryError detalhe={falha.message} />;

  const counts = new Map<string, number>();
  for (const row of assignments ?? []) {
    counts.set(row.tag_id, (counts.get(row.tag_id) ?? 0) + 1);
  }

  const tags = (tagsData ?? []).map((t) => ({
    ...t,
    person_count: counts.get(t.id) ?? 0,
  }));

  return <TagsEditor tags={tags} />;
}

/** Catálogo de documentos: árvore de grupos, subgrupos e documentos. */
async function DocumentTypesSection() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_types")
    .select("id, parent_id, name, position")
    .order("position");

  // Sem isto, uma leitura falha vira "Catálogo vazio" — e a reação a isso é
  // recriar as pastas, duplicando tudo. É o cenário que a 0011 documentou.
  if (error) return <QueryError detalhe={error.message} />;

  return <DocumentTypesEditor nodes={data ?? []} />;
}

/** Status que uma etapa de processo pode assumir. */
async function StageStatusesSection() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stage_statuses")
    .select("id, code, label, color, position, is_default, is_done, is_system")
    .order("position");

  if (error) return <QueryError detalhe={error.message} />;

  return <StageStatusesEditor statuses={data ?? []} />;
}

/**
 * Tipos de visto: lista ou detalhe, conforme `?visa=<id>`.
 *
 * Parâmetro em vez de rota aninhada porque a casca das configurações usa
 * `[section]` — criar `/configuracoes/tipos-de-visto/[id]` colidiria com ela.
 * O endereço continua compartilhável.
 */
async function VisaTypesSection({ visaId }: { visaId?: string }) {
  const supabase = await createClient();

  if (visaId) {
    const [
      { data: visa, error: visaError },
      { data: stages, error: stagesError },
      { data: catalog, error: catalogError },
      { data: selections, error: selectionsError },
    ] = await Promise.all([
        supabase.from("visa_types").select("*").eq("id", visaId).maybeSingle(),
        supabase
          .from("visa_stages")
          .select("id, parent_id, name, position, is_required, estimated_days")
          .eq("visa_type_id", visaId)
          .order("position"),
        supabase
          .from("document_types")
          .select("id, parent_id, name, position")
          .order("position"),
        supabase
          .from("visa_type_documents")
          .select("id, document_type_id, is_required, deadline_days, position")
          .eq("visa_type_id", visaId),
      ]);

    // Leitura falha não é "não encontrado", e catálogo falho não é catálogo
    // vazio — as duas confusões levam a recriar o que já existe.
    const falha = visaError ?? stagesError ?? catalogError ?? selectionsError;
    if (falha) return <QueryError detalhe={falha.message} />;

    if (!visa) {
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
          <VisaTypeDialog visaType={visa} />
        </div>

        <div>
          <h3 className="text-lg font-semibold">{visa.name}</h3>
          {visa.description ? (
            <p className="text-sm text-muted-foreground">{visa.description}</p>
          ) : null}
        </div>

        <Tabs defaultValue="etapas">
          <TabsList className="rounded-2xl">
            <TabsTrigger value="etapas" className="rounded-xl">
              Etapas ({stages?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="documentos" className="rounded-xl">
              Documentos ({selections?.length ?? 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="etapas" className="pt-4">
            <VisaStagesEditor visaTypeId={visaId} stages={stages ?? []} />
          </TabsContent>

          <TabsContent value="documentos" className="pt-4">
            <VisaDocumentsEditor
              visaTypeId={visaId}
              catalog={catalog ?? []}
              selections={selections ?? []}
            />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  const [
    { data: types, error: typesError },
    { data: stageCounts, error: stageCountsError },
    { data: docCounts, error: docCountsError },
  ] = await Promise.all([
    supabase.from("visa_types").select("*").order("position").order("name"),
    supabase.from("visa_stages").select("visa_type_id"),
    supabase.from("visa_type_documents").select("visa_type_id"),
  ]);

  // Sem isto, uma leitura falha vira "Nenhum tipo de visto ainda. Crie o
  // primeiro" — convite para recriar o molde inteiro em cima do que existe.
  const falhaLista = typesError ?? stageCountsError ?? docCountsError;
  if (falhaLista) return <QueryError detalhe={falhaLista.message} />;

  const countBy = (rows: { visa_type_id: string }[] | null) => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      map.set(row.visa_type_id, (map.get(row.visa_type_id) ?? 0) + 1);
    }
    return map;
  };

  const stagesByType = countBy(stageCounts);
  const docsByType = countBy(docCounts);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <VisaTypeDialog />
      </div>

      {(types ?? []).length === 0 ? (
        <EmptyState
          icon={FileStack}
          title="Nenhum tipo de visto ainda"
          hint="Crie o primeiro — EB-1A, EB-2 NIW, O-1."
        />
      ) : (
        <ul className="space-y-2">
          {(types ?? []).map((type) => (
            <li
              key={type.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{type.name}</p>
                <p className="text-xs text-muted-foreground">
                  {stagesByType.get(type.id) ?? 0} etapas ·{" "}
                  {docsByType.get(type.id) ?? 0} documentos
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
                  stagesByType.get(type.id) ?? 0
                } etapas e ${
                  docsByType.get(type.id) ?? 0
                } pastas exigidas. Processos já criados a partir dele não são afetados — a cópia dentro do processo é independente. Não dá para desfazer.`}
                confirmLabel="Excluir o molde"
                triggerLabel={`Excluir ${type.name}`}
                needsConfirmation={
                  (stagesByType.get(type.id) ?? 0) +
                    (docsByType.get(type.id) ?? 0) >
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

/** Seção ainda sem conteúdo: diz o que vai ter e em que fase. */
function PlannedSection({
  phase,
  planned,
}: {
  phase?: string;
  planned?: string[];
}) {
  return (
    <div className="space-y-4 rounded-3xl border border-dashed p-5">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">Em construção</Badge>
        {phase ? (
          <span className="text-sm text-muted-foreground">{phase}</span>
        ) : null}
      </div>

      {planned?.length ? (
        <ul className="space-y-2 text-sm">
          {planned.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
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
        <PlannedSection phase={found.phase} planned={found.planned} />
      )}
    </div>
  );
}
