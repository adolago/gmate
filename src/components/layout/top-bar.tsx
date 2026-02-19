"use client";

import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

const BREADCRUMB_MAP: Record<string, string> = {
  "/": "Dashboard",
  "/questions": "Question Bank",
  "/sessions": "Study Sessions",
  "/review": "Review Queue",
  "/progress": "Progress",
};

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();

  const breadcrumb =
    BREADCRUMB_MAP[pathname] ??
    Object.entries(BREADCRUMB_MAP).find(([path]) =>
      pathname.startsWith(path) && path !== "/"
    )?.[1] ??
    "Dashboard";

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">GMATE</span>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{breadcrumb}</span>
      </div>
      <Button variant="ghost" size="sm" onClick={handleLogout}>
        <LogOut className="size-4" />
        Log out
      </Button>
    </header>
  );
}
