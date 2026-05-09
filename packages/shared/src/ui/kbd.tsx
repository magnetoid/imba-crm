import * as React from "react"
import { cn } from "../lib/utils"

export const Kbd = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        "pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-60",
        className,
      )}
      {...props}
    />
  ),
)
Kbd.displayName = "Kbd"
