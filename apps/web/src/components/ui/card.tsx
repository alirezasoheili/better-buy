import type { ComponentProps } from "react";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

function Card({
  className,
  asChild = false,
  ...props
}: ComponentProps<"section"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "section";
  return (
    <Comp
      data-slot="card"
      className={cn(
        "rounded-xl border border-border bg-card text-foreground",
        className
      )}
      {...props}
    />
  );
}

export { Card };
