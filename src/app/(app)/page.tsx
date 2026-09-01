import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut } from "@/features/auth/actions";
import { getUserContext } from "@/features/organizations/queries";

export default async function HomePage() {
  const context = await getUserContext();

  // O middleware já redireciona quem não está autenticado; isto é só o
  // fecho de segurança caso o matcher mude no futuro.
  if (!context) return null;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image
            src="/duli-logo.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 object-contain"
          />
          <div>
            <h1 className="text-lg font-semibold text-primary">Duli Hub</h1>
            <p className="text-sm text-muted-foreground">
              {context.fullName ?? context.email}
            </p>
          </div>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm">
            Sair
          </Button>
        </form>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Suas organizações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {context.error ? (
            <div className="space-y-1 text-sm">
              <p className="font-medium text-destructive">
                Não foi possível ler as organizações.
              </p>
              <p className="text-muted-foreground">{context.error}</p>
              <p className="text-muted-foreground">
                Esperado enquanto a migration <code>0001_core.sql</code> não
                tiver sido aplicada no projeto Supabase.
              </p>
            </div>
          ) : context.organizations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma organização vinculada a esta conta ainda.
            </p>
          ) : (
            <ul className="space-y-2">
              {context.organizations.map((org) => (
                <li
                  key={org.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">{org.name}</p>
                    <p className="text-xs text-muted-foreground">{org.slug}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary">{org.role}</Badge>
                    {org.type === "root" ? <Badge>Duli</Badge> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
