import { Link, createFileRoute } from '@tanstack/react-router'
import { type SubmitEvent, useState } from 'react'
import { AuthError, AuthShell, GoogleButton, OrDivider } from '#/components/auth-shell'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { safeNext } from '#/lib/redirect'

const OAUTH_ERRORS: Record<string, string> = {
	google_unconfigured:
		'Google 登录还没配置：需要 GOOGLE_CLIENT_ID 和 GOOGLE_CLIENT_SECRET。',
	google: 'Google 登录失败，请再试一次。',
	google_email: '这个 Google 账号没有已验证的邮箱，换一个账号试试。',
	state: '登录请求过期了，请重新点击 Google 登录。',
}

export const Route = createFileRoute('/login')({
	validateSearch: (
		search: Record<string, unknown>,
	): { next?: string; error?: string } => ({
		next: typeof search.next === 'string' ? search.next : undefined,
		error: typeof search.error === 'string' ? search.error : undefined,
	}),
	component: LoginPage,
})

function LoginPage() {
	const { next, error } = Route.useSearch()
	const [message, setMessage] = useState(
		error ? (OAUTH_ERRORS[error] ?? '登录失败，请再试一次。') : '',
	)
	const [busy, setBusy] = useState(false)

	async function submit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault()
		const form = new FormData(event.currentTarget)
		setBusy(true)
		setMessage('')
		try {
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					email: form.get('email'),
					password: form.get('password'),
				}),
			})
			const payload = (await response.json().catch(() => null)) as {
				error?: { message?: string }
			} | null
			if (!response.ok) {
				setMessage(payload?.error?.message ?? '登录失败，请再试一次。')
				return
			}
			window.location.assign(safeNext(next))
		} catch {
			setMessage('网络错误，请再试一次。')
		} finally {
			setBusy(false)
		}
	}

	return (
		<AuthShell
			title="登录"
			subtitle="登录后才会显示面板，以及控制这个容器里的 Agent。"
			footer={
				<>
					还没有账号？{' '}
					<Link to="/register" className="font-semibold text-whale">
						注册
					</Link>
				</>
			}
		>
			<GoogleButton />
			<OrDivider />
			<form className="space-y-4" onSubmit={submit}>
				<div className="space-y-1.5">
					<Label htmlFor="email">邮箱</Label>
					<Input
						id="email"
						name="email"
						type="email"
						autoComplete="email"
						required
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="password">密码</Label>
					<Input
						id="password"
						name="password"
						type="password"
						autoComplete="current-password"
						required
					/>
				</div>
				<AuthError message={message} />
				<Button
					type="submit"
					disabled={busy}
					className="h-12 w-full rounded-2xl bg-whale text-base font-semibold text-white hover:bg-whale/90"
				>
					{busy ? '登录中…' : '登录'}
				</Button>
			</form>
		</AuthShell>
	)
}
