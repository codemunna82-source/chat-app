import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'outline' | 'ghost' | 'glass';
  }

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    const variants = {
      default: "bg-primary text-white hover:bg-primary-hover shadow-lg shadow-primary/20 btn-liquid",
      outline: "border border-border bg-surface/70 hover:bg-surface-hover text-foreground",
      ghost: "hover:bg-surface-hover text-foreground/80 bg-transparent",
      glass:
        "glass-panel border border-border/50 text-foreground shadow-sm hover:border-primary/30 hover:shadow-[0_0_20px_-6px_color-mix(in_srgb,var(--primary)_40%,transparent)] active:scale-[0.98] btn-liquid",
    }
    
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-2xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 disabled:pointer-events-none min-h-11 h-11 px-4",
          variants[variant],
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
