import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // text-base (16px) below the sm breakpoint, not text-sm (14px): iOS
          // Safari auto-zooms the page when a focused field's font is under
          // 16px, and that zoom is what "the form breaks on my phone" often
          // is — the layout is fine, the browser just jumped in on it.
          "flex h-12 min-h-[44px] w-full rounded-2xl glass-input px-3 py-2 text-base text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm sm:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
