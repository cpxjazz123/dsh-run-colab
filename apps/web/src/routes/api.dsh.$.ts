import { createFileRoute } from '@tanstack/react-router'
import type {} from '@tanstack/react-start'

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1']

async function forward({ request }: { request: Request }) {
	const url = new URL(request.url)
	// Static import would pull the Workers runtime into the client bundle;
	// this module is server-only, so the platform import stays dynamic.
	const { env } = await import('cloudflare:workers')
	const bridge = 'DSH_BRIDGE' in env ? env.DSH_BRIDGE : undefined
	const configured =
		'DSH_BRIDGE_URL' in env && typeof env.DSH_BRIDGE_URL === 'string'
			? env.DSH_BRIDGE_URL
			: undefined
	const local = LOCAL_HOSTS.includes(url.hostname)
	const service = local ? undefined : bridge
	const base = service
		? 'https://bridge.internal'
		: (configured?.replace(/\/$/, '') ??
			(local ? 'http://127.0.0.1:7791' : null))
	if (!base)
		return Response.json(
			{
				error: {
					message: 'The DSH bridge is only enabled on a local development host.',
					code: 'DSH_BRIDGE_DISABLED',
				},
			},
			{ status: 503 },
		)

	const path = url.pathname.slice('/api/dsh'.length) || '/'
	const contentType = request.headers.get('content-type')
	const bridgeToken =
		'DSH_BRIDGE_TOKEN' in env && typeof env.DSH_BRIDGE_TOKEN === 'string'
			? env.DSH_BRIDGE_TOKEN
			: ''
	const requestHeaders = new Headers()
	if (contentType) requestHeaders.set('content-type', contentType)
	if (bridgeToken) requestHeaders.set('authorization', `Bearer ${bridgeToken}`)
	const target = new Request(`${base}${path}${url.search}`, {
		method: request.method,
		headers: requestHeaders,
		body:
			request.method === 'GET' || request.method === 'HEAD'
				? undefined
				: request.body,
		redirect: 'manual',
	})
	let upstream: Response
	try {
		upstream = service ? await service.fetch(target) : await fetch(target)
	} catch {
		return Response.json(
			{
				error: {
					message:
						'The Colab bridge is not running. Start it with `pnpm --filter @dsh-agent/bridge dev`.',
					code: 'DSH_BRIDGE_UNREACHABLE',
				},
			},
			{ status: 502 },
		)
	}

	const headers = new Headers()
	for (const name of ['content-type', 'cache-control']) {
		const value = upstream.headers.get(name)
		if (value) headers.set(name, value)
	}
	headers.set('cache-control', 'no-store')
	return new Response(upstream.body, { status: upstream.status, headers })
}

export const Route = createFileRoute('/api/dsh/$')({
	server: {
		handlers: {
			GET: forward,
			POST: forward,
			HEAD: forward,
		},
	},
})
