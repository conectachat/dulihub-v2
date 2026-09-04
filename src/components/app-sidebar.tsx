"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  Contact,
  FolderKanban,
  LayoutDashboard,
  Search,
  Settings,
  Target,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signOut } from "@/features/auth/actions";
import { usePersistedFlag } from "@/lib/use-persisted-flag";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/crm", label: "CRM", icon: Target },
  { href: "/projetos", label: "Projetos", icon: FolderKanban },
  { href: "/financeiro", label: "Financeiro", icon: Wallet },
  { href: "/contatos", label: "Contatos", icon: Contact },
  { href: "/configuracoes", label: "Configuração", icon: Settings },
];

const STORAGE_KEY = "dulihub:sidebar-collapsed";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function AppSidebar({
  userName,
  userEmail,
  organizationName,
  roleLabel,
}: {
  userName: string;
  userEmail: string;
  organizationName: string;
  roleLabel: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = usePersistedFlag(STORAGE_KEY);

  function toggle() {
    setCollapsed(!collapsed);
  }

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col gap-4 p-3 transition-[width] duration-200 md:flex",
        collapsed ? "w-[76px]" : "w-64",
      )}
    >
      <div className="flex h-full flex-col gap-4 rounded-3xl border bg-card p-3 shadow-sm">
        {/* Identidade do usuário */}
        <div className="flex items-center gap-3">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-sm font-semibold text-primary">
            {initials(userName || userEmail)}
            <span
              className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-success"
              aria-hidden
            />
          </span>

          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {userName || userEmail}
              </p>
              <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="h-8 w-8 shrink-0 rounded-xl"
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            <ChevronLeft
              className={cn(
                "h-4 w-4 transition-transform",
                collapsed && "rotate-180",
              )}
            />
          </Button>
        </div>

        {/* Busca. Recolhida, vira atalho para os contatos. */}
        {collapsed ? (
          <Link
            href="/contatos"
            className="flex h-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Buscar"
          >
            <Search className="h-4 w-4" />
          </Link>
        ) : (
          <form action="/contatos" className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              placeholder="Buscar"
              className="rounded-2xl border-0 bg-muted pl-9"
              aria-label="Buscar contatos"
            />
          </form>
        )}

        <nav className="flex-1 space-y-1">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors",
                  collapsed && "justify-center px-0",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t pt-3">
          {!collapsed && (
            <p className="truncate px-1 text-xs text-muted-foreground">
              {organizationName}
            </p>
          )}
          <form action={signOut}>
            <Button
              type="submit"
              variant="ghost"
              size={collapsed ? "icon" : "sm"}
              className={cn("rounded-2xl", collapsed ? "mx-auto" : "w-full")}
            >
              {collapsed ? "⏻" : "Sair"}
            </Button>
          </form>
        </div>
      </div>
    </aside>
  );
}

/** Barra superior para telas estreitas, onde a lateral não cabe. */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur md:hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <Image
          src="/duli-logo.png"
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 object-contain"
        />
        <span className="font-semibold text-primary">Duli Hub</span>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3">
        {NAV.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
