import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { getUserContext } from "@/features/organizations/queries";

const NAV = [
  { href: "/", label: "Início" },
  { href: "/contatos", label: "Contatos" },
  { href: "/funil", label: "Funil" },
  { href: "/configuracoes", label: "Configurações" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getUserContext();
  const organization = context?.organizations[0];

  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-muted/30 md:flex">
        <div className="flex items-center gap-3 border-b p-4">
          <Image
            src="/duli-logo.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 object-contain"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-primary">
              Duli Hub
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {organization?.name ?? "—"}
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="space-y-2 border-t p-3">
          <p className="truncate px-1 text-xs text-muted-foreground">
            {context?.fullName ?? context?.email}
          </p>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm" className="w-full">
              Sair
            </Button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
