import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { getUserContext } from "@/features/organizations/queries";
import { ALL_SECTIONS, findSection } from "@/features/settings/sections";
import { createClient } from "@/lib/supabase/server";

import { StagesEditor } from "./stages-editor";

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
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
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
      ) : (
        <PlannedSection phase={found.phase} planned={found.planned} />
      )}
    </div>
  );
}
