import { Link, createFileRoute } from '@tanstack/react-router'
import { type SubmitEvent, useState } from 'react'
import { AuthError, AuthShell, GoogleButton, OrDivider } from '#/components/auth-shell'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'

export const Route = createFileRoute('/register')({
	component: RegisterPage,
})

function RegisterPage() {
	const [message, setMessage] = useState('')
	const [busy, setBusy] = useState(false)

	async function submit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault()
		const form = new FormData(event.currentTarget)
		setMessage('')
		const password = String(form.get('password') ?? '')
		if (password !== String(form.get('confirm') ?? '')) {
			setMessage('两次输入的密码不一致。')
			return
		}
		setBusy(true)
		try {
			const response = await fetch('/api/auth/register', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: form.get('name'),
					email: form.get('email'),
					password,
				}),
			})
			const payload = (await response.json().catch(() => null)) as {
				error?: { message?: string }
			} | null
			if (!response.ok) {
				setMessage(payload?.error?.message ?? '注册失败，请再试一次。')
				return
			}
			window.location.assign('/')
		} catch {
			setMessage('网络错误，请再试一次。')
		} finally {
			setBusy(false)
		}
	}

	return (
		<AuthShell
			title="注册"
			subtitle="注册后即可登录面板。这个栈只有一个容器，注册等于获得它的控制权。"
			footer={
				<>
					已经有账号了？{' '}
					<Link to="/login" search={{}} className="font-semibold text-whale">
						登录
					</Link>
				</>
			}
		>
			<GoogleButton />
			<OrDivider />
			<form className="space-y-4" onSubmit={submit}>
				<div className="space-y-1.5">
					<Label htmlFor="name">称呼</Label>
					<Input id="name" name="name" autoComplete="nickname" />
				</div>
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
						autoComplete="new-password"
						minLength={8}
						required
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="confirm">确认密码</Label>
					<Input
						id="confirm"
						name="confirm"
						type="password"
						autoComplete="new-password"
						minLength={8}
						required
					/>
				</div>
				<AuthError message={message} />
				<Button
					type="submit"
					disabled={busy}
					className="h-12 w-full rounded-2xl bg-whale text-base font-semibold text-white hover:bg-whale/90"
				>
					{busy ? '注册中…' : '注册'}
				</Button>
			</form>
		</AuthShell>
	)
}
