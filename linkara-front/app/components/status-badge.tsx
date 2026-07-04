import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const normalized = (status ?? "unknown").toLowerCase();

  const classes =
    normalized === "success" || normalized === "succeeded"
      ? "border-mint-500/40 bg-mint-500/10 text-mint-400"
      : normalized === "failed" || normalized === "failure"
        ? "border-red-500/40 bg-red-500/10 text-red-400"
        : normalized === "running" || normalized === "pending"
          ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
          : "border-ink-700 bg-ink-800 text-ink-500";

  return <Badge className={cn("rounded-full px-2.5 py-1 text-xs uppercase tracking-wide", classes)}>{normalized}</Badge>;
}
