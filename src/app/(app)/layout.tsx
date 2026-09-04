import { AppSidebar, MobileNav } from "@/components/app-sidebar";
import { QueryError } from "@/components/query-error";
import { getUserContext } from "@/features/organizations/queries";

const ROLE_LABELS: Record<string, string> = {
  owner: "Administrador",
  admin: "Administrador",
  staff: "Colaborador",
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getUserContext();
  const organization = context?.organizations[0];

  return (
    <div className="flex min-h-svh bg-muted/40">
      <AppSidebar
        userName={context?.fullName ?? ""}
        userEmail={context?.email ?? ""}
        organizationName={organization?.name ?? "—"}
        roleLabel={ROLE_LABELS[organization?.role ?? ""] ?? "Colaborador"}
      />

      <div className="min-w-0 flex-1">
        <MobileNav />

        {/*
          Tarja em vez de tela de erro: trocar o app inteiro porque a leitura
          de organização falhou é pior que um cabeçalho degradado. O campo
          `error` existia desde a primeira migration e nunca foi lido.
        */}
        {context?.error ? (
          <div className="mx-4 mt-4">
            <QueryError title="Seu perfil não carregou" detalhe={context.error} />
          </div>
        ) : null}
        {/* O conteúdo fica numa superfície própria, arredondada, destacada do
            fundo — mesmo princípio da lateral. */}
        <div className="p-3 md:py-3 md:pl-0 md:pr-3">
          <div className="min-h-[calc(100svh-1.5rem)] rounded-3xl border bg-background shadow-sm">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
