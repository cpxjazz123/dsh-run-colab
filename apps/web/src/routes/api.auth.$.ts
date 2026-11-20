import { createFileRoute } from '@tanstack/react-router'

const NO_STORE = { 'cache-control': 'no-store' }

function fail(status: number, message: string, code?: string): Response {
	return Response.json(
		{ error: { message, ...(code ? { code } : {}) } },
		{ status, headers: NO_STORE },
	)
}

function redirect(location: URL, cookies: string[] = []): Response {
	const headers = new Headers({ location: location.toString(), ...NO_STORE })
	for (const cookie of cookies) headers.append('set-cookie', cookie)
	return new Response(null, { status: 302, headers })
}

async function jsonBody(
	request: Request,
): Promise<Record<string, unknown> | null> {
	try {
		const value = await request.json()
		return typeof value === 'object' && value !== null
			? (value as Record<string, unknown>)
			: null
	} catch {
		return null
	}
}

type GoogleProfile = {
	sub?: unknown
	email?: unknown
	email_verified?: unknown
	name?: unknown
	picture?: unknown
}

async function handle({ request }: { request: Request }): Promise<Response> {
	// TanStack Start denies `*.server.*` in the client bundle; the module is
	// loaded lazily for the same reason as the request middleware.
	const auth = await import('#/lib/auth.server')
	const url = new URL(request.url)
	const secure = url.protocol === 'https:'
	const route = `${request.method} ${url.pathname.replace(/\/+$/, '')}`
	const env = await auth.authEnv()

	switch (route) {
		case 'POST /api/auth/register': {
			const body = await jsonBody(request)
			if (!body) return fail(400, '请求格式不对。')
			const email = auth.normalizeEmail(body.email)
			if (!email) return fail(400, '请输入有效的邮箱地址。')
			const problem = auth.passwordProblem(body.password)
			if (problem) return fail(400, problem)
			const name = auth.normalizeName(body.name) || email.split('@')[0]
			if (await auth.userByEmail(env.AUTH_DB, email))
				return fail(409, '这个邮箱已经注册过了。', 'EMAIL_TAKEN')
			const user = await auth.createPasswordUser(
				env.AUTH_DB,
				email,
				body.password as string,
				name,
			)
			if (!user) return fail(409, '这个邮箱已经注册过了。', 'EMAIL_TAKEN')
			const session = await auth.createSession(env.AUTH_DB, user.id)
			return Response.json(
				{ user },
				{
					status: 201,
					headers: {
						...NO_STORE,
						'set-cookie': auth.sessionCookie(session.token, secure),
					},
				},
			)
		}

		case 'POST /api/auth/login': {
			const body = await jsonBody(request)
			if (!body) return fail(400, '请求格式不对。')
			const email = auth.normalizeEmail(body.email)
			const password = body.password
			if (!email || typeof password !== 'string' || !password)
				return fail(401, '邮箱或密码不正确。', 'BAD_CREDENTIALS')
			const user = await auth.userByEmail(env.AUTH_DB, email)
			if (!user) {
				// Keep the response time close to the hit path so the endpoint
				// does not reveal which emails are registered.
				await auth.hashPassword(password)
				return fail(401, '邮箱或密码不正确。', 'BAD_CREDENTIALS')
			}
			if (!(await auth.verifyPassword(password, user.password_hash)))
				return fail(401, '邮箱或密码不正确。', 'BAD_CREDENTIALS')
			const session = await auth.createSession(env.AUTH_DB, user.id)
			return Response.json(
				{
					user: {
						id: user.id,
						email: user.email,
						name: user.name,
						picture: user.picture,
					},
				},
				{
					headers: {
						...NO_STORE,
						'set-cookie': auth.sessionCookie(session.token, secure),
					},
				},
			)
		}

		case 'POST /api/auth/logout': {
			const token = auth.readCookie(request, auth.SESSION_COOKIE)
			if (token) await auth.deleteSession(env.AUTH_DB, token)
			return Response.json(
				{ ok: true },
				{
					headers: {
						...NO_STORE,
						'set-cookie': auth.clearedSessionCookie(secure),
					},
				},
			)
		}

		case 'GET /api/auth/me': {
			const session = await auth.sessionUser(request)
			return Response.json(
				{ user: session?.user ?? null },
				{ headers: NO_STORE },
			)
		}

		case 'GET /api/auth/google': {
			const clientId = env.GOOGLE_CLIENT_ID?.trim()
			if (!clientId)
				return redirect(
					new URL('/login?error=google_unconfigured', url.origin),
				)
			const state = auth.randomToken()
			const target = new URL(
				'https://accounts.google.com/o/oauth2/v2/auth',
			)
			target.searchParams.set('client_id', clientId)
			target.searchParams.set(
				'redirect_uri',
				`${url.origin}/api/auth/google/callback`,
			)
			target.searchParams.set('response_type', 'code')
			target.searchParams.set('scope', 'openid email profile')
			target.searchParams.set('state', state)
			target.searchParams.set('prompt', 'select_account')
			return redirect(target, [auth.oauthStateCookie(state, secure)])
		}

		case 'GET /api/auth/google/callback': {
			const clientId = env.GOOGLE_CLIENT_ID?.trim()
			const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim()
			if (!clientId || !clientSecret)
				return redirect(
					new URL('/login?error=google_unconfigured', url.origin),
					[
						auth.clearedSessionCookie(secure),
						auth.clearedOauthStateCookie(secure),
					],
				)

			const state = url.searchParams.get('state')
			const expectedState = auth.readCookie(
				request,
				auth.OAUTH_STATE_COOKIE,
			)
			const code = url.searchParams.get('code')
			if (!state || !expectedState || state !== expectedState)
				return redirect(new URL('/login?error=state', url.origin), [
					auth.clearedOauthStateCookie(secure),
				])
			if (!code)
				return redirect(new URL('/login?error=google', url.origin), [
					auth.clearedOauthStateCookie(secure),
				])

			const tokenResponse = await fetch(
				'https://oauth2.googleapis.com/token',
				{
					method: 'POST',
					headers: {
						'content-type': 'application/x-www-form-urlencoded',
					},
					body: new URLSearchParams({
						client_id: clientId,
						client_secret: clientSecret,
						code,
						grant_type: 'authorization_code',
						redirect_uri: `${url.origin}/api/auth/google/callback`,
					}),
					signal: AbortSignal.timeout(10_000),
				},
			)
			if (!tokenResponse.ok)
				return redirect(new URL('/login?error=google', url.origin), [
					auth.clearedOauthStateCookie(secure),
				])
			const tokens = (await tokenResponse.json()) as {
				access_token?: unknown
			}
			if (typeof tokens.access_token !== 'string')
				return redirect(new URL('/login?error=google', url.origin), [
					auth.clearedOauthStateCookie(secure),
				])

			const profileResponse = await fetch(
				'https://openidconnect.googleapis.com/v1/userinfo',
				{
					headers: {
						authorization: `Bearer ${tokens.access_token}`,
					},
					signal: AbortSignal.timeout(10_000),
				},
			)
			if (!profileResponse.ok)
				return redirect(new URL('/login?error=google', url.origin), [
					auth.clearedOauthStateCookie(secure),
				])
			const profile = (await profileResponse.json()) as GoogleProfile
			const email = auth.normalizeEmail(profile.email)
			if (
				!email ||
				profile.email_verified !== true ||
				typeof profile.sub !== 'string' ||
				!profile.sub
			)
				return redirect(new URL('/login?error=google_email', url.origin), [
					auth.clearedOauthStateCookie(secure),
				])

			const user = await auth.upsertGoogleUser(env.AUTH_DB, {
				sub: profile.sub,
				email,
				name:
					auth.normalizeName(profile.name) || email.split('@')[0],
				picture:
					typeof profile.picture === 'string' ? profile.picture : '',
			})
			const session = await auth.createSession(env.AUTH_DB, user.id)
			return redirect(new URL('/', url.origin), [
				auth.sessionCookie(session.token, secure),
				auth.clearedOauthStateCookie(secure),
			])
		}

		default:
			return fail(404, 'Not found.', 'NOT_FOUND')
	}
}

export const Route = createFileRoute('/api/auth/$')({
	server: {
		handlers: {
			GET: handle,
			POST: handle,
		},
	},
})
