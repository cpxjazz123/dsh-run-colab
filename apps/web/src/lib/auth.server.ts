/**
 * Server-only account helpers: password hashing, session cookies, and the
 * D1 queries behind register / login / Google OAuth.
 *
 * `cloudflare:workers` is imported dynamically inside entry points so this
 * module never drags the Workers runtime into a client bundle.
 */

export type AuthUser = {
	id: string
	email: string
	name: string
	picture: string
}

export type AuthEnv = {
	AUTH_DB: D1Database
	GOOGLE_CLIENT_ID?: string
	GOOGLE_CLIENT_SECRET?: string
}

export const SESSION_COOKIE = 'dsh_session'
export const OAUTH_STATE_COOKIE = 'dsh_oauth_state'
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60

const PBKDF2_ITERATIONS = 210_000
const OAUTH_STATE_TTL_SECONDS = 10 * 60
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 200

export async function authEnv(): Promise<AuthEnv> {
	const { env } = await import('cloudflare:workers')
	return env as unknown as AuthEnv
}

export function normalizeEmail(value: unknown): string | null {
	if (typeof value !== 'string') return null
	const email = value.trim().toLowerCase()
	if (email.length > 254 || !EMAIL_PATTERN.test(email)) return null
	return email
}

export function normalizeName(value: unknown): string {
	return typeof value === 'string' ? value.trim().slice(0, 80) : ''
}

/** Returns a human-readable problem, or null when the password is usable. */
export function passwordProblem(value: unknown): string | null {
	if (typeof value !== 'string') return '请输入密码。'
	if (value.length < PASSWORD_MIN_LENGTH)
		return `密码至少 ${PASSWORD_MIN_LENGTH} 位。`
	if (value.length > PASSWORD_MAX_LENGTH) return '密码太长了。'
	return null
}

// ---------------------------------------------------------------- passwords

function toBase64(bytes: Uint8Array): string {
	let binary = ''
	for (const byte of bytes) binary += String.fromCharCode(byte)
	return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
	const binary = atob(value)
	const bytes = new Uint8Array(binary.length)
	for (let index = 0; index < binary.length; index += 1)
		bytes[index] = binary.charCodeAt(index)
	return bytes
}

async function derive(
	password: string,
	salt: Uint8Array,
	iterations: number,
): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(password),
		'PBKDF2',
		false,
		['deriveBits'],
	)
	const bits = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt: salt as unknown as BufferSource,
			iterations,
			hash: 'SHA-256',
		},
		key,
		256,
	)
	return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16))
	const hash = await derive(password, salt, PBKDF2_ITERATIONS)
	return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`
}

export async function verifyPassword(
	password: string,
	stored: string | null,
): Promise<boolean> {
	if (!stored) return false
	const [scheme, iterationsRaw, saltRaw, hashRaw] = stored.split('$')
	if (scheme !== 'pbkdf2' || !saltRaw || !hashRaw) return false
	const iterations = Number(iterationsRaw)
	if (!Number.isInteger(iterations) || iterations < 10_000) return false
	const expected = fromBase64(hashRaw)
	const actual = await derive(password, fromBase64(saltRaw), iterations)
	if (actual.length !== expected.length) return false
	let difference = 0
	for (let index = 0; index < actual.length; index += 1)
		difference |= actual[index] ^ expected[index]
	return difference === 0
}

// ------------------------------------------------------------------ cookies

export function buildCookie(
	name: string,
	value: string,
	maxAgeSeconds: number,
	secure: boolean,
): string {
	const parts = [
		`${name}=${value}`,
		'Path=/',
		'HttpOnly',
		'SameSite=Lax',
		`Max-Age=${maxAgeSeconds}`,
	]
	if (secure) parts.push('Secure')
	return parts.join('; ')
}

export function readCookie(request: Request, name: string): string | null {
	const header = request.headers.get('cookie')
	if (!header) return null
	for (const part of header.split(';')) {
		const separator = part.indexOf('=')
		if (separator < 0) continue
		if (part.slice(0, separator).trim() !== name) continue
		return part.slice(separator + 1).trim()
	}
	return null
}

export function sessionCookie(
	token: string,
	secure: boolean,
	maxAgeSeconds = SESSION_TTL_SECONDS,
): string {
	return buildCookie(SESSION_COOKIE, token, maxAgeSeconds, secure)
}

export function clearedSessionCookie(secure: boolean): string {
	return buildCookie(SESSION_COOKIE, '', 0, secure)
}

export function oauthStateCookie(state: string, secure: boolean): string {
	return buildCookie(
		OAUTH_STATE_COOKIE,
		state,
		OAUTH_STATE_TTL_SECONDS,
		secure,
	)
}

export function clearedOauthStateCookie(secure: boolean): string {
	return buildCookie(OAUTH_STATE_COOKIE, '', 0, secure)
}

// ----------------------------------------------------------------- sessions

export function randomToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32))
	return toBase64(bytes)
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(value),
	)
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')
}

export async function createSession(
	db: D1Database,
	userId: string,
): Promise<{ token: string; maxAge: number }> {
	const token = randomToken()
	const now = Date.now()
	await db
		.prepare(
			'INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
		)
		.bind(
			await sha256Hex(token),
			userId,
			now,
			now + SESSION_TTL_SECONDS * 1000,
		)
		.run()
	return { token, maxAge: SESSION_TTL_SECONDS }
}

export async function deleteSession(
	db: D1Database,
	token: string,
): Promise<void> {
	await db
		.prepare('DELETE FROM sessions WHERE id = ?')
		.bind(await sha256Hex(token))
		.run()
}

export async function sessionUser(
	request: Request,
): Promise<{ user: AuthUser; token: string } | null> {
	const token = readCookie(request, SESSION_COOKIE)
	if (!token) return null
	const { AUTH_DB } = await authEnv()
	const user = await AUTH_DB.prepare(
		`SELECT users.id, users.email, users.name, users.picture
		 FROM sessions JOIN users ON users.id = sessions.user_id
		 WHERE sessions.id = ? AND sessions.expires_at > ?`,
	)
		.bind(await sha256Hex(token), Date.now())
		.first<AuthUser>()
	if (!user) return null
	return { user, token }
}

// ------------------------------------------------------------------ account

type UserWithPassword = AuthUser & { password_hash: string | null }

export async function userByEmail(
	db: D1Database,
	email: string,
): Promise<UserWithPassword | null> {
	return db
		.prepare(
			'SELECT id, email, name, picture, password_hash FROM users WHERE email = ? COLLATE NOCASE',
		)
		.bind(email)
		.first<UserWithPassword>()
}

export async function createPasswordUser(
	db: D1Database,
	email: string,
	password: string,
	name: string,
): Promise<AuthUser | null> {
	const user: AuthUser = {
		id: crypto.randomUUID(),
		email,
		name,
		picture: '',
	}
	try {
		await db
			.prepare(
				`INSERT INTO users (id, email, name, picture, password_hash, google_sub, created_at)
				 VALUES (?, ?, ?, '', ?, NULL, ?)`,
			)
			.bind(user.id, email, name, await hashPassword(password), Date.now())
			.run()
	} catch {
		return null
	}
	return user
}

/**
 * Sign in with Google: reuse the row for this Google subject, else link the
 * verified email to an existing account, else create a new one.
 */
export async function upsertGoogleUser(
	db: D1Database,
	profile: { sub: string; email: string; name: string; picture: string },
): Promise<AuthUser> {
	const bySub = await db
		.prepare(
			'SELECT id, email, name, picture FROM users WHERE google_sub = ?',
		)
		.bind(profile.sub)
		.first<AuthUser>()
	if (bySub) return bySub

	const byEmail = await db
		.prepare(
			'SELECT id, email, name, picture FROM users WHERE email = ? COLLATE NOCASE',
		)
		.bind(profile.email)
		.first<AuthUser>()
	if (byEmail) {
		await db
			.prepare(
				`UPDATE users
				 SET google_sub = ?,
				     picture = CASE WHEN picture = '' THEN ? ELSE picture END
				 WHERE id = ?`,
			)
			.bind(profile.sub, profile.picture, byEmail.id)
			.run()
		return {
			...byEmail,
			picture: byEmail.picture || profile.picture,
		}
	}

	const user: AuthUser = {
		id: crypto.randomUUID(),
		email: profile.email,
		name: profile.name,
		picture: profile.picture,
	}
	await db
		.prepare(
			`INSERT INTO users (id, email, name, picture, password_hash, google_sub, created_at)
			 VALUES (?, ?, ?, ?, NULL, ?, ?)`,
		)
		.bind(
			user.id,
			user.email,
			user.name,
			user.picture,
			profile.sub,
			Date.now(),
		)
		.run()
	return user
}
