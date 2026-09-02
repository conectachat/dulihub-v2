import Link from "next/link";
import { Contact, Target, Users, Wallet } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUserContext } from "@/features/organizations/queries";
import { listPeople } from "@/features/people/queries";

export const metadata = { title: "Dashboard — Duli Hub" };

function firstName(full: string | null, email: string) {
  return full?.trim().split(/\s+/)[0] ?? email.split("@")[0];
}

export default async function DashboardPage() {
  const context = await getUserContext();

  // O proxy já barra quem não está autenticado; isto é o fecho de segurança
  // caso o matcher mude no futuro.
  if (!context) return null;

  const { people } = await listPeople();

  const totals = {
    contatos: people.length,
    comOportunidade: people.filter((p) => p.opportunity_count > 0).length,
    clientes: people.filter((p) => p.lifecycle_stage === "client").length,
  };

  const cards = [
    {
      href: "/contatos",
      icon: Contact,
      label: "Contatos",
      value: totals.contatos,
      hint: "Cadastro único: contato, oportunidade e cliente na mesma base",
    },
    {
      href: "/crm",
      icon: Target,
      label: "Com oportunidade",
      value: totals.comOportunidade,
      hint: "Pessoas com ao menos um negócio em andamento",
    },
    {
      href: "/projetos",
      icon: Wallet,
      label: "Clientes",
      value: totals.clientes,
      hint: "Viraram cliente ao fechar um processo",
    },
  ];

  return (
    <main className="space-y-6 p-6">
      <PageHeader
        title={`Olá, ${firstName(context.fullName, context.email)}`}
        description={
          context.organizations[0]?.name ?? "Sem organização vinculada"
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href} className="group">
              <Card className="h-full rounded-3xl transition-colors group-hover:border-primary/40">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.label}
                  </CardTitle>
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold tabular-nums">
                    {card.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {totals.contatos === 0 ? (
        <EmptyState
          icon={Users}
          title="Sua base ainda está vazia."
          hint="Comece cadastrando um contato — ou aguarde a importação dos dados do app antigo."
          action={
            <Link
              href="/contatos"
              className="inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Ir para Contatos
            </Link>
          }
        />
      ) : null}
    </main>
  );
}
