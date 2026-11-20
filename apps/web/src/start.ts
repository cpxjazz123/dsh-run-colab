import { createMiddleware, createStart } from '@tanstack/react-start'

/** Pages and endpoints that must stay reachable without a session. */
const PUBLIC_PATHS: Record<string, true> = {
	'/login': true,
	'/register': true,
	'/favicon.ico': true,
	'/mascot.webp': true,
	'/robots.txt': true,
}

const PUBLIC_PREFIXES = [
	'/api/auth/',
	'/assets/',
	'/.vite/',
	'/_vite/',
	'/@fs/',
	'/@id/',
	'/node_modules/',
]

function isPublic(pathname: string): boolean {
	return (
		pathname in PUBLIC_PATHS ||
		PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
	)
}

const requireAccount = createMiddleware({ type: 'request' }).server(
	async ({ request, pathname, next }) => {
		if (isPublic(pathname)) return next()
		// TanStack Start denies `*.server.*` modules in the client bundle, so the
		// auth module is loaded lazily; a static import here would fail the
		// client build.
		const { sessionUser } = await import('#/lib/auth.server')
		if (await sessionUser(request)) return next()

		if (pathname.startsWith('/api/'))
			return Response.json(
				{
					error: {
						message: 'Sign in to use the control API.',
						code: 'AUTH_REQUIRED',
					},
				},
				{ status: 401, headers: { 'cache-control': 'no-store' } },
			)

		const url = new URL(request.url)
		const login = new URL('/login', url.origin)
		if (url.pathname !== '/')
			login.searchParams.set('next', `${url.pathname}${url.search}`)
		return new Response(null, {
			status: 302,
			headers: { location: login.toString(), 'cache-control': 'no-store' },
		})
	},
)

export const startInstance = createStart(() => ({
	requestMiddleware: [requireAccount],
}))
