import { Suspense } from "react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--mint-500)/0.08),transparent_30%),radial-gradient(circle_at_bottom_right,hsl(var(--mint-600)/0.12),transparent_22%)]" />
      <div className="relative w-full max-w-md">
        <Suspense fallback={<div className="text-center text-ink-500">Loading...</div>}>
          {children}
        </Suspense>
      </div>
    </div>
  );
}
