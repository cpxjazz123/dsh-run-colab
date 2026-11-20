import * as React from 'react'
import { cn } from '#/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-20 w-full rounded-2xl border-2 border-ink/10 bg-white px-3.5 py-2.5 text-base text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-whale focus-visible:ring-4 focus-visible:ring-whale/15 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15 md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
