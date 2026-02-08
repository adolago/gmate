"use client";

import { usePathname } from "next/navigation";

const BREADCRUMB_MAP: Record<string, string> = {
  "/": "Dashboard",
  "/questions": "Question Bank",
  "/sessions": "Study Sessions",
  "/review": "Review Queue",
  "/progress": "Progress",
};

export function TopBar() {
  const pathname = usePathname();

  const breadcrumb =
    BREADCRUMB_MAP[pathname] ??
    Object.entries(BREADCRUMB_MAP).find(([path]) =>
      pathname.startsWith(path) && path !== "/"
    )?.[1] ??
    "Dashboard";

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">GMATE</span>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{breadcrumb}</span>
      </div>
    </header>
  );
}
