import { Container, switchPort } from '@cloudflare/containers'

type Env = {
	DSH_BRIDGE: DurableObjectNamespace<DshBridgeContainer>
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

	constructor(ctx: DurableObjectState, env: Env) {
		// The SDK types its state parameter as `DurableObjectState<{}>`; the
		// bridge keeps its state in the container and config file.
		super(ctx as unknown as DurableObjectState<{}>, env)
		this.envVars = containerEnv(env)
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
