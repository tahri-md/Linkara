import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-24 w-full rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-ink-100 shadow-sm transition-colors placeholder:text-ink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
