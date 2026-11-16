import { createFileRoute } from '@tanstack/react-router'
import { DeepSeekAgent } from '#/components/deepseek-agent'

export const Route = createFileRoute('/')({
	component: AgentPage,
})

function AgentPage() {
	return (
		<main className="mx-auto min-h-dvh max-w-5xl px-4 py-8 sm:px-6">
			<header className="mb-6 space-y-1">
				<h1 className="text-2xl font-semibold tracking-tight">DSH Agent</h1>
				<p className="text-sm text-muted-foreground">
					DeepSeek Harness on Colab, with optional image generation and QQ Bot.
				</p>
			</header>
			<DeepSeekAgent />
		</main>
	)
}
