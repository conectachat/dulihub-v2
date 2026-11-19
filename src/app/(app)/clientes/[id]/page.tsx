import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, FolderKanban, Mail, Phone } from "lucide-react";

import { AbasNaUrl } from "@/components/abas-na-url";
import { CopiarTexto } from "@/components/copiar-texto";
import { EmptyState } from "@/components/empty-state";
import { DadosCadastrais } from "@/components/perfil/dados-cadastrais";
import { PersonTags } from "@/components/perfil/person-tags";
import { Timeline } from "@/components/perfil/timeline";
import { QueryError } from "@/components/query-error";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { cadastroDoContato } from "@/features/cadastro/queries";
import { listTags } from "@/features/people/queries";
import { getTimeline } from "@/features/people/timeline-queries";
import { processosDoContato, vistosParaProcesso } from "@/features/projects/queries";
import { formatarDia, telefoneCompleto } from "@/lib/formatar";
import { origemDoPedido } from "@/lib/origem";
import { destinoDoPerfil, type AbaDoPerfil } from "@/lib/pessoa";
import { createClient } from "@/lib/supabase/server";

import { PersonDialog } from "../../contatos/person-dialog";
import { BarraDeProgresso, SeloDoStatus } from "../../projetos/partes";
import { Cobrancas } from "./cobrancas";
import { NovoProcessoDialog } from "./novo-processo-dialog";

export const metadata = { title: "Cliente — Duli Hub" };

const ABAS: { valor: AbaDoPerfil; rotulo: string }[] = [
  { valor: "dados", rotulo: "Dados cadastrais" },
  { valor: "financeiro", rotulo: "Financeiro" },
  { valor: "projetos", rotulo: "Projetos" },
  { valor: "documentos", rotulo: "Documentos" },
  { valor: "notas", rotulo: "Notas" },
];

/**
 * O perfil do cliente (CLI-2, CLI-3): cabeçalho numa linha e cinco abas, com
 * a aberta na URL (`?aba=`).
 *
 * Lê do servidor, como Contatos e CRM (exceção registrada no `AGENTS.md`); a
 * aba Financeiro é a exceção da exceção — lê do aparelho, como a tela
 * Financeiro. Quem não é cliente volta para `/contatos/<id>`; o cliente na
 * lixeira abre normalmente, com o selo.
 */
export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `novo-processo=<negócio>`: o atalho do CRM abre o diálogo já preenchido. */
  searchParams: Promise<{ "novo-processo"?: string }>;
}) {
  const [{ id }, { "novo-processo": negocioDoAtalho }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();

  const { data: person, error: personError } = await supabase
    .from("people")
    .select(
      `id, full_name, email, phone, phone_country_code, company, job_title,
       lifecycle_stage, created_at, deleted_at, notes, owner_id, client_since,
       person_tags(tag:tags(id, name))`,
    )
    .eq("id", id)
    .maybeSingle();

  // Erro antes de 404: consulta que falha não é "não existe".
  if (personError) return <QueryError detalhe={personError.message} />;
  // Some para quem não pode ver: a RLS devolve vazio.
  if (!person) notFound();

  const destino = destinoDoPerfil(person);
  if (destino) redirect(destino);

  const [
    { data: oportunidades, error: oportunidadesError },
    { tags: allTags, error: tagsError },
    { items: timeline, error: timelineError },
    { data: { user }, error: userError },
    { processos, error: processosError },
    { vistos, error: vistosError },
    { cadastro, error: cadastroError },
    { data: dono, error: donoError },
    cabecalhos,
  ] = await Promise.all([
    supabase
      .from("opportunities")
      .select("id, title, status")
      .eq("person_id", id)
      .order("created_at", { ascending: false }),
    listTags(),
    getTimeline(id),
    supabase.auth.getUser(),
    processosDoContato(id),
    vistosParaProcesso(),
    cadastroDoContato(id),
    // A chave do dono aponta para `organization_members`: o nome vem à parte.
    person.owner_id
      ? supabase.from("profiles").select("full_name, email").eq("id", person.owner_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    headers(),
  ]);

  const falha =
    oportunidadesError?.message ??
    tagsError ??
    timelineError ??
    userError?.message ??
    processosError ??
    vistosError ??
    cadastroError ??
    donoError?.message;
  if (falha) return <QueryError detalhe={falha} />;

  const origem = origemDoPedido(cabecalhos);
  const negocios = oportunidades ?? [];
  const tags = person.person_tags.map((t) => t.tag);
  const telefone = telefoneCompleto(person.phone_country_code, person.phone);

  // Negócio ganho que ainda não virou processo: a oferta do CRM, repetida
  // aqui onde o processo nasce.
  const comProcesso = new Set(processos.map((p) => p.opportunity_id));
  const ganhosSemProcesso = negocios.filter((o) => o.status === "won" && !comProcesso.has(o.id));
  // Só abre sozinho se o negócio do link é mesmo deste cliente.
  const negocioInicial = negocios.some((o) => o.id === negocioDoAtalho) ? negocioDoAtalho : undefined;

  return (
    <main className="space-y-6 p-6">
      <Link
        href="/clientes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Clientes
      </Link>

      {/* Numa linha no computador; quebra em duas ou três no celular. */}
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-serif text-2xl font-medium tracking-tight">{person.full_name}</h1>
          <Badge>Cliente</Badge>
          {person.deleted_at ? <Badge variant="destructive">Na lixeira</Badge> : null}
        </div>

        {telefone ? (
          <span className="inline-flex items-center gap-1 text-sm">
            <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
            {telefone}
            <CopiarTexto texto={telefone} rotulo="telefone" />
          </span>
        ) : null}

        {person.email ? (
          <span className="inline-flex min-w-0 items-center gap-1 text-sm">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
            <a href={`mailto:${person.email}`} className="truncate hover:underline">
              {person.email}
            </a>
            <CopiarTexto texto={person.email} rotulo="e-mail" />
          </span>
        ) : null}

        <span className="text-sm text-muted-foreground">
          Dono: <span className="text-foreground">{dono ? dono.full_name || dono.email : "—"}</span>
        </span>
        <span className="text-sm text-muted-foreground">
          Cliente desde{" "}
          <span className="text-foreground">
            {person.client_since ? formatarDia(person.client_since) : "—"}
          </span>
        </span>

        <PersonTags personId={person.id} allTags={allTags} selectedIds={tags.map((t) => t.id)} />

        <div className="ml-auto">
          <PersonDialog person={person} />
        </div>
      </header>

      <AbasNaUrl abas={ABAS} padrao="dados">
        <TabsContent value="dados" className="pt-4">
          {cadastro ? (
            <DadosCadastrais personId={person.id} cadastro={cadastro} origem={origem} />
          ) : null}
        </TabsContent>

        <TabsContent value="financeiro" className="pt-4">
          {/* Lê do aparelho: o caminho que funciona com e sem internet. */}
          <Cobrancas personId={person.id} />
        </TabsContent>

        <TabsContent value="projetos" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-medium">Processos ({processos.length})</h2>
            <NovoProcessoDialog
              // A chave remonta o diálogo quando o atalho muda de negócio.
              key={negocioInicial ?? "sem-atalho"}
              personId={person.id}
              personName={person.full_name}
              vistos={vistos}
              negocios={negocios.map((o) => ({ id: o.id, title: o.title }))}
              negocioInicial={negocioInicial}
            />
          </div>

          {ganhosSemProcesso.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {ganhosSemProcesso.map((o) => (
                <li key={o.id} className="text-muted-foreground">
                  Negócio ganho sem processo: <span className="text-foreground">{o.title}</span> ·{" "}
                  <Link
                    href={`/clientes/${person.id}?aba=projetos&novo-processo=${o.id}`}
                    className="text-primary hover:underline"
                  >
                    Criar processo
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          {processos.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              size="compact"
              title="Nenhum processo ainda."
              hint="Ao criar, as etapas e as pastas vêm do tipo de visto."
            />
          ) : (
            <Card>
              <CardContent className="pt-6">
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
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="documentos" className="pt-4">
          <EmptyState
            icon={FileText}
            size="compact"
            title="Nenhum documento ainda."
            hint="Passaporte, identidade, comprovante de residência e contrato ficam aqui."
          />
        </TabsContent>

        <TabsContent value="notas" className="space-y-6 pt-4">
          <Timeline personId={person.id} items={timeline} currentUserId={user?.id ?? null} />

          {person.notes ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Observações do cadastro antigo</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{person.notes}</p>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </AbasNaUrl>
    </main>
  );
}
