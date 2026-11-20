import type { ReactNode } from 'react'

export function AuthShell({
	title,
	subtitle,
	children,
	footer,
}: {
	title: string
	subtitle: string
	children: ReactNode
	footer?: ReactNode
}) {
	return (
		<main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
			<header className="text-center">
				<p className="text-[11px] font-black tracking-[0.35em] text-whale uppercase">
					DeepSeek Harness
				</p>
				<h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
					大肥鱼 Agent
				</h1>
			</header>
			<section className="animate-pop rounded-[2rem] border-2 border-white bg-white/85 p-6 shadow-[0_30px_60px_-32px_rgba(14,36,66,0.45)] backdrop-blur sm:p-8">
				<h2 className="text-xl font-black">{title}</h2>
				<p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
				<div className="mt-6">{children}</div>
				{footer ? (
					<p className="mt-6 border-t border-dashed border-ink/10 pt-4 text-center text-sm text-muted-foreground">
						{footer}
					</p>
				) : null}
			</section>
			<p className="text-center text-xs text-muted-foreground">
				Cloudflare Workers · Google Colab · 云端的大肥鱼
			</p>
		</main>
	)
}

export function AuthError({ message }: { message: string }) {
	if (!message) return null
	return (
		<p
			role="alert"
			className="rounded-2xl border-2 border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm text-destructive"
		>
			{message}
		</p>
	)
}

export function GoogleButton() {
	return (
		<a
			href="/api/auth/google"
			className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-ink/10 bg-white text-base font-semibold text-ink transition-colors hover:bg-belly"
		>
			<GoogleMark />
			使用 Google 登录
		</a>
	)
}

function GoogleMark() {
	return (
		<svg aria-hidden viewBox="0 0 24 24" className="size-5">
			<path
				fill="#4285F4"
				d="M23.5 12.3c0-.9-.1-1.6-.2-2.3H12v4.3h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.2-2 3.7-5 3.7-8.7Z"
			/>
			<path
				fill="#34A853"
				d="M12 24c3.2 0 5.9-1.1 7.8-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.1 1.2-3.2 0-5.9-2.1-6.8-5.1l-3.9 3C3.2 21.3 7.3 24 12 24Z"
			/>
			<path
				fill="#FBBC05"
				d="M5.2 14.3a7.4 7.4 0 0 1 0-4.6l-3.9-3A12 12 0 0 0 0 12c0 1.9.5 3.8 1.3 5.3l3.9-3Z"
			/>
			<path
				fill="#EA4335"
				d="M12 4.7c2.3 0 3.9 1 4.8 1.9l3.3-3.2C18 1.3 15.2 0 12 0 7.3 0 3.2 2.7 1.3 6.7l3.9 3C6.1 6.8 8.8 4.7 12 4.7Z"
			/>
		</svg>
	)
}

export function OrDivider() {
	return (
		<div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
			<span className="h-px flex-1 bg-ink/10" />
			或
			<span className="h-px flex-1 bg-ink/10" />
		</div>
	)
}
