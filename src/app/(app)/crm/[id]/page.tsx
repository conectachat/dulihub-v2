import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MessageCircle, Phone } from "lucide-react";

import { QueryError } from "@/components/query-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cadastroDoContato } from "@/features/cadastro/queries";
import { linkDoWhatsApp } from "@/features/cadastro/regras";
import { obterNegocio } from "@/features/opportunities/queries";
import { equipeDaOrganizacao } from "@/features/pages/queries";
import { trilhaDoFunil } from "@/features/opportunities/regras";
import { listTags } from "@/features/people/queries";
import { getTimeline } from "@/features/people/timeline-queries";
import { diaEmSaoPaulo, formatarData, hojeEmSaoPaulo, telefoneCompleto } from "@/lib/formatar";
import { daGestaoDe } from "@/lib/organizacao";
import { origemDoPedido } from "@/lib/origem";
import { createClient } from "@/lib/supabase/server";

import { DadosCadastrais } from "@/components/perfil/dados-cadastrais";
import { PersonTags } from "@/components/perfil/person-tags";
import { Timeline } from "@/components/perfil/timeline";
import { enderecoDaPessoa } from "@/lib/pessoa";
import { PersonDialog } from "../../contatos/person-dialog";
import {
  AjustarDataDoGanho,
  EditarNegocio,
  GanhoEPerdido,
  Reabrir,
  ReabrirGanho,
} from "./acoes-do-negocio";
import { CartaoDaFormaDePagamento } from "./forma-de-pagamento";
import { Trilha } from "./trilha";
import { Vistos } from "./vistos";

export const metadata = { title: "Lead — Duli Hub" };

/**
 * A tela do lead: o negócio enquanto está no funil.
 *
 * Existe porque o cartão do CRM abria a ficha do contato, que mostra
 * processos e financeiro — "como se já fosse cliente" (Renato, 3/out). Aqui
 * fica só o que serve para fechar: o contato, o negócio, a conversa e a ficha
 * de cadastro, que vem antes do contrato. Processo e financeiro chegam com o
 * Ganho, no perfil completo do cliente.
 */
export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { negocio, etapas, catalogo, error } = await obterNegocio(id);

  // Erro antes de 404: consulta que falha não é "não existe".
  if (error) return <QueryError detalhe={error} />;
  if (!negocio || !negocio.person) notFound();

  const pessoa = negocio.person;
  const supabase = await createClient();

  const [
    { tags: allTags, error: tagsError },
    { items: timeline, error: timelineError },
    { cadastro, error: cadastroError },
    { data: { user }, error: userError },
    cabecalhos,
  ] = await Promise.all([
    listTags(),
    getTimeline(pessoa.id),
    cadastroDoContato(pessoa.id),
    supabase.auth.getUser(),
    headers(),
  ]);

  // Dono e participantes saem da equipe da organização do negócio.
  const { equipe, error: equipeError } = await equipeDaOrganizacao(negocio.organization_id);
  if (equipeError) return <QueryError detalhe={equipeError} />;
  const nomeDoDono = equipe.find((m) => m.id === negocio.owner_id)?.nome ?? null;

  const falha = tagsError ?? timelineError ?? cadastroError ?? userError?.message;
  if (falha) return <QueryError detalhe={falha} />;

  // "Ajustar data" (CRM-17) e confirmar ou refazer a forma de pagamento
  // (entrega 4a) são da gestão da organização do negócio; a forma, também do
  // dono. O banco confere de novo.
  const { daGestao, error: papelError } = await daGestaoDe(
    supabase,
    negocio.organization_id,
    user?.id ?? null,
  );
  if (papelError) return <QueryError detalhe={papelError} />;
  const podeConfirmar = (user !== null && negocio.owner_id === user.id) || daGestao;

  const degraus = trilhaDoFunil(etapas, negocio.stage_id);
  const aberto = negocio.status === "open";
  const ganho = negocio.status === "won";
  const perdido = negocio.status === "lost";
  const { forma } = negocio;

  const telefone = telefoneCompleto(pessoa.phone_country_code, pessoa.phone);
  const whatsapp = linkDoWhatsApp(pessoa.phone_country_code, pessoa.phone, "");

  return (
    <main className="space-y-6 p-6">
      <Link
        href="/crm"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        CRM
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-2xl font-medium tracking-tight">
              {pessoa.full_name}
            </h1>
            <Badge variant={ganho ? "default" : perdido ? "destructive" : "secondary"}>
              {ganho ? "Ganho" : perdido ? "Perdido" : "Lead"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{negocio.title}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {whatsapp ? (
            <Button asChild variant="outline" className="rounded-xl">
              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-1 h-4 w-4" />
                WhatsApp
              </a>
            </Button>
          ) : null}
          {aberto ? (
            <GanhoEPerdido negocio={{ id: negocio.id, cliente: pessoa.full_name }} />
          ) : null}
        </div>
      </header>

      {ganho ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-success/40 p-4">
          <p className="text-sm">
            Negócio ganho
            {negocio.closed_at ? ` em ${formatarData(negocio.closed_at)}` : ""}.{" "}
            {pessoa.full_name} é cliente: processos e financeiro ficam no perfil
            completo.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" className="rounded-xl">
              <Link href={enderecoDaPessoa(pessoa.id, "client")}>Abrir perfil do cliente</Link>
            </Button>
            {daGestao && negocio.closed_at ? (
              <AjustarDataDoGanho
                negocioId={negocio.id}
                dia={diaEmSaoPaulo(negocio.closed_at)}
                hoje={hojeEmSaoPaulo()}
              />
            ) : null}
            {degraus[0] ? (
              <ReabrirGanho
                negocio={{ id: negocio.id, cliente: pessoa.full_name }}
                destino={degraus[0].name}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {perdido ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-destructive/40 p-4">
          <p className="text-sm">
            Negócio perdido
            {negocio.closed_at ? ` em ${formatarData(negocio.closed_at)}` : ""}
            {negocio.lost_reason ? (
              <>
                {" "}
                — motivo: <strong>{negocio.lost_reason}</strong>
              </>
            ) : null}
            .
          </p>
          {degraus[0] ? <Reabrir negocioId={negocio.id} etapaId={degraus[0].id} /> : null}
        </div>
      ) : null}

      <div className="rounded-3xl border bg-card p-4">
        <Trilha negocioId={negocio.id} degraus={degraus} travada={ganho} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Contato</CardTitle>
              <PersonDialog person={pessoa} />
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {pessoa.company || pessoa.job_title ? (
                <p className="text-muted-foreground">
                  {[pessoa.job_title, pessoa.company].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{telefone ?? "—"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                {pessoa.email ? (
                  <a href={`mailto:${pessoa.email}`} className="truncate hover:underline">
                    {pessoa.email}
                  </a>
                ) : (
                  <span>—</span>
                )}
              </div>

              <div className="space-y-2 border-t pt-3">
                <p className="font-medium">Tags</p>
                <PersonTags
                  personId={pessoa.id}
                  allTags={allTags}
                  selectedIds={pessoa.person_tags.map((t) => t.tag.id)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Negócio</CardTitle>
              <EditarNegocio
                negocio={negocio}
                equipe={equipe}
                participantes={negocio.participantes.map((p) => p.user_id)}
                nomeDoDono={nomeDoDono}
              />
            </CardHeader>
            <CardContent>
              <Vistos
                negocioId={negocio.id}
                itens={negocio.itens}
                catalogo={catalogo}
                ganho={ganho}
                travadaPelaForma={forma?.status === "confirmada" && !forma.charges_created_at}
              />
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Dono</dt>
                  <dd>{nomeDoDono ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Origem</dt>
                  <dd>{negocio.source || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Criado em</dt>
                  <dd>{formatarData(negocio.created_at)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <CartaoDaFormaDePagamento
            negocioId={negocio.id}
            pessoaId={pessoa.id}
            nomeDaPessoa={pessoa.full_name}
            itens={negocio.itens}
            forma={forma}
            aberto={aberto}
            podeConfirmar={podeConfirmar}
          />
        </div>

        <div className="space-y-6 lg:col-span-2">
          {/*
            A ficha de cadastro mora aqui porque acontece antes do contrato:
            o lead diz que fecha, preenche a ficha, e só então o negócio é
            ganho.
          */}
          {cadastro ? (
            <DadosCadastrais
              personId={pessoa.id}
              cadastro={cadastro}
              origem={origemDoPedido(cabecalhos)}
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline
                personId={pessoa.id}
                items={timeline}
                currentUserId={user?.id ?? null}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
