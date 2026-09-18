import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FolderKanban, Mail, Phone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { QueryError } from "@/components/query-error";
import { formatarMoeda } from "@/lib/totals";
import { LIFECYCLE_LABELS } from "@/features/people/schema";
import { listTags } from "@/features/people/queries";
import { getTimeline } from "@/features/people/timeline-queries";
import {
  processosDoContato,
  vistosParaProcesso,
} from "@/features/projects/queries";

import { PersonDialog } from "../person-dialog";
import { BarraDeProgresso, SeloDoStatus } from "../../projetos/partes";
import { NovoProcessoDialog } from "./novo-processo-dialog";
import { PersonTags } from "./person-tags";
import { Timeline } from "./timeline";
import { formatarData, formatarDia, telefoneCompleto } from "@/lib/formatar";

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `novo-processo=<negócio>`: o atalho do CRM abre o diálogo já preenchido. */
  searchParams: Promise<{ "novo-processo"?: string }>;
}) {
  const { id } = await params;
  const { "novo-processo": negocioDoAtalho } = await searchParams;
  const supabase = await createClient();

  const { data: person, error: personError } = await supabase
    .from("people")
    .select(
      `id, full_name, email, phone, phone_country_code, company, job_title,
       lifecycle_stage, created_at, notes,
       person_tags(tag:tags(id, name))`,
    )
    .eq("id", id)
    .maybeSingle();

  // Erro antes de 404: consulta falha não é "não existe". Sem esta linha,
  // uma queda de leitura devolvia página de não encontrado para um contato
  // que está no banco.
  if (personError) return <QueryError detalhe={personError.message} />;

  // Some para quem não pode ver: a RLS devolve vazio, e 404 não revela se o
  // registro existe em outra organização.
  if (!person) notFound();

  const [
    { data: opportunitiesRaw, error: oportunidadesError },
    { tags: allTags, error: tagsError },
    { items: timeline, error: timelineError },
    { data: { user }, error: userError },
    { processos, error: processosError },
    { vistos, error: vistosError },
  ] = await Promise.all([
    supabase
      .from("opportunities")
      .select("id, title, status, value, currency, created_at, stage:pipeline_stages(name)")
      .eq("person_id", id)
      .order("created_at", { ascending: false }),
    listTags(),
    getTimeline(id),
    supabase.auth.getUser(),
    processosDoContato(id),
    vistosParaProcesso(),
  ]);

  // O erro de `getUser` entra junto: sem ele, `user` vem nulo e a linha do
  // tempo inteira parece de outra pessoa, escondendo os botões de excluir.
  const falha =
    oportunidadesError?.message ??
    tagsError ??
    timelineError ??
    userError?.message ??
    processosError ??
    vistosError;
  if (falha) return <QueryError detalhe={falha} />;

  // Com os tipos gerados, o cliente sabe que `stage` e `tag` são objetos:
  // as duas relações são para-um. Antes eram inferidas como lista e
  // precisavam de conversão à força.
  const opportunities = opportunitiesRaw ?? [];
  const tags = person.person_tags.map((t) => t.tag);

  // Negócio ganho que ainda não virou processo: é a oferta do CRM, repetida
  // aqui onde o processo nasce.
  const comProcesso = new Set(processos.map((p) => p.opportunity_id));
  // Só abre sozinho se o negócio do link é mesmo deste contato.
  const negocioInicial = opportunities.some((o) => o.id === negocioDoAtalho)
    ? negocioDoAtalho
    : undefined;

  const phone = telefoneCompleto(person.phone_country_code, person.phone);

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
            <h1 className="font-serif text-2xl font-medium tracking-tight">
              {person.full_name}
            </h1>
            <Badge variant="secondary">
              {LIFECYCLE_LABELS[person.lifecycle_stage] ?? person.lifecycle_stage}
            </Badge>
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
              Cadastrado em {formatarData(person.created_at)}
            </p>

            <div className="space-y-2 border-t pt-3">
              <p className="font-medium">Tags</p>
              <PersonTags
                personId={person.id}
                allTags={allTags}
                selectedIds={tags.map((t) => t.id)}
              />
            </div>
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
                        {formatarData(op.created_at)}
                      </p>
                    </div>
                    <div className="shrink-0 space-y-1 text-right">
                      {op.value != null ? (
                        <p className="font-medium">
                          {formatarMoeda(op.value, op.currency)}
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
                      {op.status === "won" && !comProcesso.has(op.id) ? (
                        <Link
                          href={`/contatos/${person.id}?novo-processo=${op.id}`}
                          className="block text-xs text-primary hover:underline"
                        >
                          Criar processo
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-base">Processos ({processos.length})</CardTitle>
          <NovoProcessoDialog
            // A chave remonta o diálogo quando o atalho muda de negócio.
            key={negocioInicial ?? "sem-atalho"}
            personId={person.id}
            personName={person.full_name}
            vistos={vistos}
            negocios={opportunities.map((o) => ({ id: o.id, title: o.title }))}
            negocioInicial={negocioInicial}
          />
        </CardHeader>
        <CardContent>
          {processos.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <FolderKanban className="h-4 w-4 shrink-0" />
              Nenhum processo ainda. Ao criar, as etapas e as pastas vêm do tipo
              de visto.
            </p>
          ) : (
            <ul className="divide-y">
              {processos.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/projetos/${p.id}`}
                      className="block truncate font-medium hover:underline"
                    >
                      {p.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {p.visto?.name ?? "Tipo de visto removido"} · desde{" "}
                      {formatarDia(p.started_on)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <BarraDeProgresso progresso={p.progresso} />
                    <SeloDoStatus status={p.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {person.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Observações do cadastro antigo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{person.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          <Timeline
            personId={person.id}
            items={timeline}
            currentUserId={user?.id ?? null}
          />
        </CardContent>
      </Card>
    </main>
  );
}
