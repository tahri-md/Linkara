"use client";

import { AppStateProvider } from "@/lib/store";
import { Toaster } from "@/components/ui/toaster";

export function Providers({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AppStateProvider>
      {children}
      <Toaster />
    </AppStateProvider>
  );
}
