import { useMutation, useQuery } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { Button } from './ui/button'

type MeResponse = { user: { email: string; name: string } | null }

async function fetchMe(): Promise<MeResponse> {
	const response = await fetch('/api/auth/me', {
		headers: { accept: 'application/json' },
	})
	if (!response.ok) return { user: null }
	return (await response.json()) as MeResponse
}

/** Signed-in account row: email plus a sign-out button. */
export function AccountBar() {
	const me = useQuery({
		queryKey: ['auth', 'me'],
		queryFn: fetchMe,
		retry: false,
		staleTime: 60_000,
	})
	const logout = useMutation({
		mutationFn: async () => {
			await fetch('/api/auth/logout', { method: 'POST' })
		},
		onSuccess: () => window.location.assign('/login'),
	})

	if (!me.data?.user) return null
	return (
		<div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
			<span className="truncate">已登录 · {me.data.user.email}</span>
			<Button
				type="button"
				variant="ghost"
				size="xs"
				disabled={logout.isPending}
				onClick={() => logout.mutate()}
				className="rounded-full px-2 text-xs font-semibold"
			>
				<LogOut className="size-3" />
				退出登录
			</Button>
		</div>
	)
}
