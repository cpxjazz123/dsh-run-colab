import { createFileRoute } from '@tanstack/react-router'
import type {} from '@tanstack/react-start'

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1']

async function forward({ request }: { request: Request }) {
	const url = new URL(request.url)
	// Static import would pull the Workers runtime into the client bundle;
	// this module is server-only, so the platform import stays dynamic.
	const { env } = await import('cloudflare:workers')
	const api = 'DSH_API' in env ? env.DSH_API : undefined
	const configured =
		'DSH_API_URL' in env && typeof env.DSH_API_URL === 'string'
			? env.DSH_API_URL
			: undefined
	const local = LOCAL_HOSTS.includes(url.hostname)
	const service = local ? undefined : api
	const base = service
		? 'https://api.internal'
		: (configured?.replace(/\/$/, '') ??
			(local ? 'http://127.0.0.1:8080' : null))
	if (!base)
		return Response.json(
			{
				error: {
					message: 'The backend API is only enabled on a local development host.',
					code: 'DSH_API_DISABLED',
				},
			},
			{ status: 503 },
		)

	const path = url.pathname.slice('/api/dsh'.length) || '/'
	const contentType = request.headers.get('content-type')
	const apiToken =
		'DSH_API_TOKEN' in env && typeof env.DSH_API_TOKEN === 'string'
			? env.DSH_API_TOKEN
			: ''
	const requestHeaders = new Headers()
	if (contentType) requestHeaders.set('content-type', contentType)
	if (apiToken) requestHeaders.set('authorization', `Bearer ${apiToken}`)
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
						'The backend API is not running. Start it with `pnpm --filter @dsh-agent/api dev`.',
					code: 'DSH_API_UNREACHABLE',
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
