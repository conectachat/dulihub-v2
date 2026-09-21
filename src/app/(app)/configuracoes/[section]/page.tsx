import { notFound } from "next/navigation";

import { SectionHeader } from "@/components/page-header";
import { EmConstrucao } from "@/components/em-construcao";
import { getUserContext } from "@/features/organizations/queries";
import { ALL_SECTIONS, findSection } from "@/features/settings/sections";
import { VERSAO } from "@/lib/versao";

import { Bandeja } from "./bandeja";
import { SecoesDoAparelho } from "./secoes-locais";
import { VersaoDoApp } from "./versao-do-app";

/**
 * As seções que já desenham do espelho no aparelho.
 *
 * A casca delas não traz dado nenhum — nem de qual usuário é — e é isso que
 * permite ao service worker guardá-la e abrir a tela sem internet.
 */
const ESPELHADAS = [
  "etapas-do-funil",
  "tags",
  "categorias-de-documento",
  "tipos-de-visto",
  "status-de-etapas",
];

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
      ) : found.slug === "sincronizacao" ? (
        <Bandeja />
      ) : ESPELHADAS.includes(found.slug) ? (
        <SecoesDoAparelho slug={found.slug} visa={visa} />
      ) : (
        <EmConstrucao fase={found.phase} itens={found.planned} />
      )}
    </div>
  );
}
