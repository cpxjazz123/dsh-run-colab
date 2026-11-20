/**
 * Backend edge for the DSH panel.
 *
 * The browser reaches this Worker for the Agent UI, generated images, and the
 * control API; the panel Worker calls it through a service binding. Everything
 * is forwarded to `dsh-colab-bridge`, the Worker that owns the Colab container,
 * so provider secrets and the container image never sit on the public Worker.
 */
type Env = {
	DSH_COLAB_BRIDGE: Fetcher
	/** Bearer token shared with the panel Worker and the container. */
	DSH_BRIDGE_TOKEN: string
}

const CONTROL_PATHS: Record<string, true> = {
	'/state': true,
	'/install': true,
	'/start': true,
	'/stop': true,
	'/session/stop': true,
	'/config': true,
	'/generate': true,
	'/qqbot': true,
}

/** Compare fixed-size digests so the token check does not leak its length. */
async function authorized(request: Request, expected: string): Promise<boolean> {
	if (!expected) return false
	const encoder = new TextEncoder()
	const provided = request.headers.get('authorization') ?? ''
	const [a, b] = await Promise.all([
		crypto.subtle.digest('SHA-256', encoder.encode(provided)),
		crypto.subtle.digest('SHA-256', encoder.encode(`Bearer ${expected}`)),
	])
	return crypto.subtle.timingSafeEqual(a, b)
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url)
		if (url.pathname === '/health') return Response.json({ ok: true })

		const control =
			url.pathname in CONTROL_PATHS || url.pathname.startsWith('/generate/')
		if (control && !(await authorized(request, env.DSH_BRIDGE_TOKEN)))
			return new Response('Unauthorized', { status: 401 })

		// The bridge Worker maps control paths and `/images/*` to the bridge
		// process, and everything else (the DSH Web UI) to port 18080.
		return env.DSH_COLAB_BRIDGE.fetch(request)
	},
} satisfies ExportedHandler<Env>
