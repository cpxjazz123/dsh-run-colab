import { createFileRoute } from '@tanstack/react-router'
import { DeepSeekAgent } from '#/components/deepseek-agent'

export const Route = createFileRoute('/')({
	component: AgentPage,
})

function AgentPage() {
	return (
		<main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center gap-6 px-4 py-10">
			<header className="text-center">
				<p className="text-[11px] font-black tracking-[0.35em] text-whale uppercase">
					DeepSeek Harness
				</p>
				<h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
					大肥鱼 Agent
				</h1>
			</header>
			<DeepSeekAgent />
			<p className="text-center text-xs text-muted-foreground">
				Cloudflare Workers · Google Colab · 云端的大肥鱼
			</p>
		</main>
	)
}
