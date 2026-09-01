"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SETTINGS_GROUPS } from "@/features/settings/sections";
import { cn } from "@/lib/utils";

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-5 p-3">
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const href = `/configuracoes/${item.slug}`;
              const active = pathname === href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.slug}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
