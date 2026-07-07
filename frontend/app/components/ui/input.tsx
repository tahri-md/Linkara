import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-ink-100 shadow-sm transition-colors placeholder:text-ink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
