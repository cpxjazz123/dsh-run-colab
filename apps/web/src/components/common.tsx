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
			className="my-4 flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
		>
			<AlertCircle className="size-5 shrink-0" />
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
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			{children}
			{hint && <p className="text-sm text-muted-foreground">{hint}</p>}
		</div>
	)
}
