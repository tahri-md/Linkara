import * as React from "react";

import { cn } from "@/lib/utils";

function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center rounded-full border border-ink-700 bg-ink-800 px-2.5 py-0.5 text-xs font-medium text-ink-100",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
