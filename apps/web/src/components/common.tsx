import { AlertCircle } from 'lucide-react'
import { Label } from '#/components/ui/label'

function describe(error: unknown) {
	if (!(error instanceof Error)) return 'Unable to load this data.'
	if ('issues' in error && Array.isArray(error.issues))
		return (error.issues as { path: PropertyKey[]; message: string }[])
			.map((issue) =>
				issue.path.length
					? `${issue.path.join('.')}: ${issue.message}`
					: issue.message,
			)
			.join('; ')
	return error.message
}

export function ErrorNotice({ error }: { error: unknown }) {
	return error ? (
		<div
			role="alert"
			className="flex gap-3 rounded-2xl border-2 border-destructive/25 bg-destructive/5 p-4 text-sm text-ink"
		>
			<AlertCircle className="size-5 shrink-0 text-destructive" />
			{describe(error)}
		</div>
	) : null
}

export function Field({
	label,
	id,
	hint,
	children,
}: {
	label: string
	id: string
	hint?: string
	children: React.ReactNode
}) {
	return (
		<div className="space-y-1.5">
			<Label
				htmlFor={id}
				className="text-xs font-bold tracking-wide text-muted-foreground uppercase"
			>
				{label}
			</Label>
			{children}
			{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
		</div>
	)
}
