import { Container, switchPort } from '@cloudflare/containers'

type Env = {
	DSH_BRIDGE: DurableObjectNamespace<DshBridgeContainer>
	/** Durable copy of the user settings, keyed `config`. */
	CONFIG_KV: KVNamespace
	/** Bearer token the DSH web app uses for the bridge control endpoints. */
	DSH_BRIDGE_TOKEN: string
	DSH_PUBLIC_URL?: string
	DEEPSEEK_API_KEY?: string
	DEEPSEEK_BASE_URL?: string
	DEEPSEEK_MODEL?: string
	COLAB_OAUTH_TOKEN?: string
	GOOGLE_CLOUD_PROJECT?: string
}

const BRIDGE_PATHS = new Set([
	'/state',
	'/install',
	'/start',
	'/stop',
	'/session/stop',
	'/config',
	'/generate',
	'/qqbot',
])
const INSTANCE = 'colab-bridge-v2'
const CONFIG_KEY = 'config'

/** Settings the panel owns; session state such as `token` stays in the container. */
const CONFIG_FIELDS = ['apiKey', 'baseUrl', 'model', 'imageGeneration'] as const

/**
 * Merge a `/config` or `/start` body into the KV copy. Identity replaces the
 * whole object because the panel always sends every field.
 */
async function rememberConfig(env: Env, patch: unknown): Promise<void> {
	if (typeof patch !== 'object' || patch === null) return
	const body = patch as Record<string, unknown>
	try {
		const raw = await env.CONFIG_KV.get(CONFIG_KEY)
		const current: Record<string, unknown> = raw
			? ((JSON.parse(raw) as Record<string, unknown>) ?? {})
			: {}
		const next: Record<string, unknown> = { ...current }
		for (const key of CONFIG_FIELDS)
			if (key in body) next[key] = body[key]
		if (typeof body.identity === 'object' && body.identity !== null)
			next.identity = body.identity
		await env.CONFIG_KV.put(CONFIG_KEY, JSON.stringify(next))
	} catch (error) {
		// Persisting is best effort: the request still reaches the container.
		console.error('config mirror failed', error)
	}
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

function containerEnv(env: Env): Record<string, string> {
	const values: Record<string, string | undefined> = {
		DEEPSEEK_API_KEY: env.DEEPSEEK_API_KEY,
		DEEPSEEK_BASE_URL: env.DEEPSEEK_BASE_URL,
		DEEPSEEK_MODEL: env.DEEPSEEK_MODEL,
		DSH_BRIDGE_TOKEN: env.DSH_BRIDGE_TOKEN,
		COLAB_OAUTH_TOKEN: env.COLAB_OAUTH_TOKEN,
		GOOGLE_CLOUD_PROJECT: env.GOOGLE_CLOUD_PROJECT,
		DSH_PUBLIC_URL: env.DSH_PUBLIC_URL,
	}
	return Object.fromEntries(
		Object.entries(values).filter((entry): entry is [string, string] =>
			typeof entry[1] === 'string' && entry[1].length > 0,
		),
	)
}

export class DshBridgeContainer extends Container<Env> {
	defaultPort = 7791
	requiredPorts = [7791]
	/** Stop an idle bridge quickly; the Colab session has its own lifecycle. */
	sleepAfter = '5m'
	enableInternet = true

	private bootConfig?: Promise<void>

	constructor(ctx: DurableObjectState, env: Env) {
		// The SDK types its state parameter as `DurableObjectState<{}>`; the
		// bridge keeps its state in the container and config file.
		super(ctx as unknown as DurableObjectState<{}>, env)
		this.envVars = containerEnv(env)
	}

	/** Seed a fresh container with the last settings saved from the panel. */
	private loadBootConfig(): Promise<void> {
		this.bootConfig ??= (async () => {
			try {
				const raw = await this.env.CONFIG_KV.get(CONFIG_KEY)
				if (raw) this.envVars = { ...containerEnv(this.env), DSH_BOOT_CONFIG: raw }
			} catch (error) {
				console.error('config load failed', error)
			}
		})()
		return this.bootConfig
	}

	override async fetch(request: Request): Promise<Response> {
		// Runs before the SDK starts the container, so envVars carries the
		// stored settings into a brand-new instance.
		await this.loadBootConfig()
		return await super.fetch(request)
	}

	override onStart(): void {
		console.log('dsh bridge container started')
	}

	override onStop(): void {
		console.log('dsh bridge container stopped')
	}

	override onError(error: unknown): void {
		console.error('dsh bridge container error', error)
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url)
		if (url.pathname === '/health') {
			return Response.json({ ok: true })
		}

		if (
			(request.method === 'POST' && url.pathname === '/config') ||
			(request.method === 'POST' && url.pathname === '/start')
		) {
			const patch = await request
				.clone()
				.json()
				.catch(() => null)
			await rememberConfig(env, patch)
		}

		const bridge = env.DSH_BRIDGE.getByName(INSTANCE)
		if (
			BRIDGE_PATHS.has(url.pathname) ||
			url.pathname.startsWith('/generate/')
		) {
			if (!(await authorized(request, env.DSH_BRIDGE_TOKEN))) {
				return new Response('Unauthorized', { status: 401 })
			}
			// The bridge listens on 7791 and owns these control endpoints.
			return bridge.fetch(request)
		}
		if (url.pathname.startsWith('/images/')) {
			// Generated images are addressed by an unguessable UUID and must be
			// loadable by the browser without the bridge bearer token.
			return bridge.fetch(request)
		}

		// Everything else is the DSH Web UI, including its absolute assets and
		// WebSocket upgrades. The bridge's SSH tunnel publishes it on 18080.
		return bridge.fetch(switchPort(request, 18080))
	},
} satisfies ExportedHandler<Env>
