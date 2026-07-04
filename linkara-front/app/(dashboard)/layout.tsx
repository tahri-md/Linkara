"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { LogOut, Workflow, PlaySquare, LayoutDashboard, Building2 } from "lucide-react";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/organizations", label: "Organizations", icon: Building2 },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/runs", label: "Runs", icon: PlaySquare },
];

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const { user, logout, loading } = useApp();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-ink-700/80 bg-ink-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-3 text-ink-100">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-mint-500/12 text-mint-500 shadow-glow">
                <span className="text-sm font-bold">L</span>
              </div>
              <div>
                <p className="text-sm font-semibold tracking-wide">Linkara</p>
                <p className="text-xs text-ink-500">Self-hosted CI/CD</p>
              </div>
            </Link>
            <nav className="hidden items-center gap-2 md:flex">
              {navigation.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors",
                      active
                        ? "border-mint-400/40 bg-mint-500/10 text-mint-400"
                        : "border-transparent text-ink-500 hover:border-ink-700 hover:bg-ink-900 hover:text-ink-100",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {loading ? (
              <div className="h-10 w-40 animate-pulse rounded-full bg-ink-800" />
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" className="gap-3 rounded-full px-2 py-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name ?? user.email} />
                      <AvatarFallback>{(user.name ?? user.email).slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="hidden text-left sm:block">
                      <span className="block text-sm font-medium text-ink-100">{user.name ?? user.email}</span>
                      <span className="block text-xs text-ink-500">Authenticated</span>
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-default text-ink-500">{user.email}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-red-400 focus:text-red-300">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Suspense fallback={<div className="text-center text-ink-500">Loading...</div>}>
          {children}
        </Suspense>
      </main>
    </div>
  );
}
