import * as React from 'react'
import { cn } from '#/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-11 w-full min-w-0 rounded-2xl border-2 border-ink/10 bg-white px-3.5 py-2 text-base text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-whale focus-visible:ring-4 focus-visible:ring-whale/15',
        'aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
