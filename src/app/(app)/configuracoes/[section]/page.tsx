import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getUserContext } from "@/features/organizations/queries";
import { deleteVisaType } from "@/features/settings/visa-type-actions";
import { ALL_SECTIONS, findSection } from "@/features/settings/sections";
import { createClient } from "@/lib/supabase/server";

import { DocumentTypesEditor } from "./document-types-editor";
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

  const { data: pipeline } = await supabase
    .from("pipelines")
    .select("id, name")
    .eq("is_default", true)
    .maybeSingle();

  if (!pipeline) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum funil configurado nesta organização.
      </p>
    );
  }

  const [{ data: stagesData }, { data: opportunities }] = await Promise.all([
    supabase
      .from("pipeline_stages")
      .select("id, name, position, is_won, is_lost")
      .eq("pipeline_id", pipeline.id)
      .order("position"),
    supabase.from("opportunities").select("stage_id"),
  ]);

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

  const [{ data: tagsData }, { data: assignments }] = await Promise.all([
    supabase.from("tags").select("id, name, color").order("name"),
    supabase.from("person_tags").select("tag_id"),
  ]);

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
  const { data } = await supabase
    .from("document_types")
    .select("id, parent_id, name, is_group, position")
    .order("position");

  return <DocumentTypesEditor nodes={data ?? []} />;
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
    const [{ data: visa }, { data: stages }, { data: catalog }, { data: selections }] =
      await Promise.all([
        supabase.from("visa_types").select("*").eq("id", visaId).maybeSingle(),
        supabase
          .from("visa_stages")
          .select("id, parent_id, name, position, is_required, estimated_days")
          .eq("visa_type_id", visaId)
          .order("position"),
        supabase
          .from("document_types")
          .select("id, parent_id, name, is_group, position")
          .order("position"),
        supabase
          .from("visa_type_documents")
          .select("id, document_type_id, is_required, deadline_days")
          .eq("visa_type_id", visaId),
      ]);

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

  const [{ data: types }, { data: stageCounts }, { data: docCounts }] =
    await Promise.all([
      supabase.from("visa_types").select("*").order("position").order("name"),
      supabase.from("visa_stages").select("visa_type_id"),
      supabase.from("visa_type_documents").select("visa_type_id"),
    ]);

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
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum tipo de visto ainda. Crie o primeiro — EB-1A, EB-2 NIW, O-1.
        </p>
      ) : (
        <ul className="space-y-2">
          {(types ?? []).map((type) => (
            <li
              key={type.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border p-3"
            >
              <Link
                href={`/configuracoes/tipos-de-visto?visa=${type.id}`}
                className="min-w-0 flex-1"
              >
                <p className="truncate font-medium hover:underline">{type.name}</p>
                <p className="text-xs text-muted-foreground">
                  {stagesByType.get(type.id) ?? 0} etapas ·{" "}
                  {docsByType.get(type.id) ?? 0} documentos
                  {type.estimated_days ? ` · ${type.estimated_days} dias` : ""}
                </p>
              </Link>

              {!type.is_active ? (
                <Badge variant="secondary">Inativo</Badge>
              ) : null}

              <VisaTypeDialog visaType={type} />

              <form action={deleteVisaType}>
                <input type="hidden" name="id" value={type.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Excluir ${type.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </form>
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
    <div className="space-y-4 rounded-2xl border border-dashed p-5">
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
      <header>
        <h2 className="text-xl font-semibold tracking-tight">{found.label}</h2>
        <p className="text-sm text-muted-foreground">{found.description}</p>
      </header>

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
      ) : (
        <PlannedSection phase={found.phase} planned={found.planned} />
      )}
    </div>
  );
}
