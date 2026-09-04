import Link from "next/link";
import { Briefcase, RotateCcw, Trash2, Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { restorePerson, softDeletePerson } from "@/features/people/actions";
import { listPeople, listTags } from "@/features/people/queries";

import { ContactFilters } from "./filters";
import { PersonDialog } from "./person-dialog";
import { TagFilter } from "./tag-filter";

export const metadata = { title: "Contatos — Duli Hub" };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function fullPhone(ddi: string | null, phone: string | null) {
  if (!phone) return null;
  return ddi ? `${ddi} ${phone}` : phone;
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default async function ContatosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; tags?: string }>;
}) {
  const { q, view, tags } = await searchParams;
  const tagIds = (tags ?? "").split(",").filter(Boolean);

  const [{ people, error }, { tags: allTags, error: tagsError }] = await Promise.all([
    listPeople({
      search: q,
      tagIds,
      view: view === "excluidos" ? "excluidos" : "ativos",
    }),
    listTags(),
  ]);

  const showingDeleted = view === "excluidos";

  return (
    <main className="space-y-6 p-6">
      <PageHeader
        title="Contatos"
        description="Fonte única dos seus contatos. Cada contato pode ter múltiplas oportunidades."
        actions={<PersonDialog />}
      />

      <ContactFilters>
        <TagFilter tags={allTags} />
      </ContactFilters>

      {error ?? tagsError ? (
        <div className="rounded-2xl border border-destructive/50 p-4 text-sm">
          <p className="font-medium text-destructive">
            Não foi possível carregar os contatos.
          </p>
          <p className="text-muted-foreground">{error}</p>
        </div>
      ) : people.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            showingDeleted
              ? "Nenhum contato excluído."
              : q
                ? `Nenhum contato encontrado para "${q}".`
                : "Nenhum contato ainda."
          }
          hint={
            !showingDeleted && !q ? "Crie o primeiro no botão acima." : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-3xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((person) => {
                const phone = fullPhone(person.phone_country_code, person.phone);

                return (
                  <TableRow key={person.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                          {initials(person.full_name)}
                        </span>
                        <Link
                          href={`/contatos/${person.id}`}
                          className="font-medium hover:underline"
                        >
                          {person.full_name}
                        </Link>
                      </div>
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {phone ?? "—"}
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {person.email ?? "—"}
                    </TableCell>

                    <TableCell>
                      {person.tags.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {person.tags.map((tag) => (
                            <Badge key={tag.id} variant="secondary">
                              {tag.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {dateFormatter.format(new Date(person.created_at))}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/contatos/${person.id}`}
                          className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-primary hover:bg-accent"
                          aria-label={`${person.opportunity_count} oportunidade(s) de ${person.full_name}`}
                        >
                          <Briefcase className="h-4 w-4" />
                          {person.opportunity_count > 0 ? (
                            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-medium text-brand-foreground">
                              {person.opportunity_count}
                            </span>
                          ) : null}
                        </Link>

                        <PersonDialog person={person} />

                        {showingDeleted ? (
                          <form action={restorePerson}>
                            <input type="hidden" name="id" value={person.id} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="icon"
                              className="text-primary"
                              aria-label={`Restaurar ${person.full_name}`}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </form>
                        ) : (
                          <form action={softDeletePerson}>
                            <input type="hidden" name="id" value={person.id} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="icon"
                              className="text-primary/60 hover:text-destructive"
                              aria-label={`Excluir ${person.full_name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </form>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
