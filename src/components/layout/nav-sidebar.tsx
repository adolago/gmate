"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: "~" },
  { href: "/questions", label: "Questions", icon: "?" },
  { href: "/sessions", label: "Sessions", icon: ">" },
  { href: "/review", label: "Review", icon: "!" },
  { href: "/progress", label: "Progress", icon: "#" },
];

export function NavSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-52 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 items-center border-b border-border px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          GMATE
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <span className="font-mono text-xs opacity-50">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <div className="rounded-md bg-sidebar-accent/50 px-3 py-2 text-xs text-sidebar-foreground/60">
          GMAT Focus Edition 2026
        </div>
      </div>
    </aside>
  );
}
