import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MessageCircle, Phone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { LIFECYCLE_LABELS } from "@/features/people/schema";

import { PersonDialog } from "../person-dialog";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const currencyFormatter = (currency: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency });

type Opportunity = {
  id: string;
  title: string;
  status: "open" | "won" | "lost";
  value: number | null;
  currency: string;
  created_at: string;
  stage: { name: string } | null;
};

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: person } = await supabase
    .from("people")
    .select(
      `id, full_name, email, phone, phone_country_code, company, job_title,
       lifecycle_stage, created_at, notes,
       person_tags(tag:tags(id, name))`,
    )
    .eq("id", id)
    .maybeSingle();

  // Some para quem não pode ver: a RLS devolve vazio, e 404 não revela se o
  // registro existe em outra organização.
  if (!person) notFound();

  const { data: opportunitiesRaw } = await supabase
    .from("opportunities")
    .select("id, title, status, value, currency, created_at, stage:pipeline_stages(name)")
    .eq("person_id", id)
    .order("created_at", { ascending: false });

  const opportunities = (opportunitiesRaw ?? []) as unknown as Opportunity[];
  // Sem os tipos gerados do banco, o cliente Supabase infere a relação
  // aninhada como lista. Em runtime `tag` é objeto, porque tags é to-one.
  type TagRow = { tag: { id: string; name: string } | null };
  const tags = ((person.person_tags ?? []) as unknown as TagRow[])
    .map((t) => t.tag)
    .filter((t): t is { id: string; name: string } => t !== null);

  const phone = person.phone
    ? `${person.phone_country_code ?? ""} ${person.phone}`.trim()
    : null;
  const waDigits = `${person.phone_country_code ?? ""}${person.phone ?? ""}`.replace(/\D/g, "");

  return (
    <main className="space-y-6 p-6">
      <Link
        href="/contatos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Contatos
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {person.full_name}
            </h1>
            <Badge variant="secondary">
              {LIFECYCLE_LABELS[person.lifecycle_stage] ?? person.lifecycle_stage}
            </Badge>
            {tags.map((tag) => (
              <Badge key={tag.id} variant="outline">
                {tag.name}
              </Badge>
            ))}
          </div>
          {person.company || person.job_title ? (
            <p className="text-sm text-muted-foreground">
              {[person.job_title, person.company].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>

        <PersonDialog person={person} />
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{phone ?? "—"}</span>
              {waDigits.length >= 10 ? (
                <a
                  href={`https://wa.me/${waDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-600 hover:underline"
                  aria-label="Abrir WhatsApp"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              {person.email ? (
                <a href={`mailto:${person.email}`} className="hover:underline">
                  {person.email}
                </a>
              ) : (
                <span>—</span>
              )}
            </div>
            <p className="text-muted-foreground">
              Cadastrado em {dateFormatter.format(new Date(person.created_at))}
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Oportunidades ({opportunities.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {opportunities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma oportunidade ainda. A mesma pessoa pode ter várias ao
                longo do tempo, sem virar cadastro duplicado.
              </p>
            ) : (
              <ul className="divide-y">
                {opportunities.map((op) => (
                  <li
                    key={op.id}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{op.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {op.stage?.name ?? "—"} ·{" "}
                        {dateFormatter.format(new Date(op.created_at))}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {op.value != null ? (
                        <p className="font-medium">
                          {currencyFormatter(op.currency).format(op.value)}
                        </p>
                      ) : null}
                      <Badge
                        variant={
                          op.status === "won"
                            ? "default"
                            : op.status === "lost"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {op.status === "won"
                          ? "Ganho"
                          : op.status === "lost"
                            ? "Perdido"
                            : "Aberta"}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {person.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{person.notes}</p>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
