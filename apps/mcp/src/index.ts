#!/usr/bin/env node
/**
 * MCP server for the DSH Agent backend API.
 *
 * It exposes the same control API the web panel uses, so an MCP client can
 * inspect and drive the Colab-hosted DeepSeek Agent:
 *
 *   DSH_API_URL   API origin, default http://127.0.0.1:8080
 *   DSH_API_TOKEN bearer token shared with the API Worker and the container
 *
 * Tools that change remote state (`dsh_start`, `dsh_stop`,
 * `dsh_delete_session`, `dsh_generate_image`) act on the real Colab session.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = (
	process.env.DSH_API_URL || "http://127.0.0.1:8080"
).replace(/\/+$/, "");
const API_TOKEN = (process.env.DSH_API_TOKEN || "").trim();

type Json = unknown;

interface DshState {
	session: {
		name: string;
		found: boolean;
		hardware: string | null;
		status: string | null;
	};
	installed: boolean;
	snapshot: boolean;
	drive: boolean;
	running: boolean;
	hasKey: boolean;
	baseUrl: string;
	model: string;
	imageGeneration: boolean;
	identity: {
		name: string;
		persona: string;
		personality: string;
		communicationStyle: string;
		instructions: string;
	};
	url: string | null;
}

type ImageStatus =
	| "starting"
	| "installing"
	| "loading"
	| "generating"
	| "ready"
	| "error";

interface ImageJob {
	id: string;
	status: ImageStatus;
	prompt: string;
	width: number;
	height: number;
	seed: number | null;
	model: string;
	imagePath: string | null;
	url: string | null;
	mimeType: string;
	error: string | null;
	updatedAt: number;
}

class ApiError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

function errorMessage(body: Json): string | null {
	if (typeof body !== "object" || body === null || !("error" in body))
		return null;
	const error = body.error;
	if (
		typeof error === "object" &&
		error !== null &&
		"message" in error &&
		typeof error.message === "string"
	)
		return error.message;
	return null;
}

async function api<T = Json>(
	path: string,
	options: { method?: string; body?: Json; signal?: AbortSignal } = {},
): Promise<T> {
	const headers: Record<string, string> = {};
	if (API_TOKEN) headers.authorization = `Bearer ${API_TOKEN}`;
	const init: RequestInit = { method: options.method ?? "GET", headers };
	if (options.body !== undefined) {
		headers["content-type"] = "application/json";
		init.body = JSON.stringify(options.body);
	}
	if (options.signal) init.signal = options.signal;
	let response: Response;
	try {
		response = await fetch(`${API_URL}${path}`, init);
	} catch (error) {
		throw new ApiError(
			`The DSH backend API is not reachable at ${API_URL}. Start it with \`pnpm --filter @dsh-agent/api dev\` before retrying. ${
				error instanceof Error ? error.message : String(error)
			}`,
			0,
		);
	}
	const raw = await response.text();
	let payload: Json = null;
	if (raw) {
		try {
			payload = JSON.parse(raw);
		} catch {
			throw new ApiError(
				`The DSH backend API returned non-JSON content (${response.status}).`,
				response.status,
			);
		}
	}
	if (!response.ok)
		throw new ApiError(
			errorMessage(payload) ??
				`DSH backend request failed (${response.status}).`,
			response.status,
		);
	return payload as T;
}

function textResult(payload: Json) {
	return {
		content: [
			{ type: "text" as const, text: JSON.stringify(payload, null, 2) },
		],
	};
}

function failure(error: unknown) {
	const message =
		error instanceof Error ? error.message : String(error ?? "unknown error");
	return { isError: true, content: [{ type: "text" as const, text: message }] };
}

function sleep(ms: number, signal?: AbortSignal) {
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	if (signal?.aborted) {
		reject(new Error("aborted"));
		return promise;
	}
	const onAbort = () => {
		clearTimeout(timer);
		reject(new Error("aborted"));
	};
	const timer = setTimeout(() => {
		signal?.removeEventListener("abort", onAbort);
		resolve();
	}, ms);
	signal?.addEventListener("abort", onAbort, { once: true });
	return promise;
}

const identitySchema = z
	.object({
		name: z.string().min(1).max(80).optional(),
		persona: z.string().max(4000).optional(),
		personality: z.string().max(2000).optional(),
		communicationStyle: z.string().max(1000).optional(),
		instructions: z.string().max(8000).optional(),
	})
	.describe(
		"Fields are merged into the stored identity; omitted fields keep their current value.",
	);

const server = new McpServer({ name: "dsh-agent", version: "0.1.0" });

server.registerTool(
	"dsh_state",
	{
		title: "Read DSH agent state",
		description:
			"Current Colab session, install/snapshot flags, whether the agent Web UI is running, whether an API key is saved, the provider config, the identity, and the Agent UI URL.",
		annotations: { readOnlyHint: true },
		inputSchema: {},
	},
	async (_args, extra) => {
		try {
			return textResult(await api<DshState>("/state", { signal: extra.signal }));
		} catch (error) {
			return failure(error);
		}
	},
);

server.registerTool(
	"dsh_start",
	{
		title: "Start the DSH agent",
		description:
			"Provision or reuse the Colab CPU session, install DSH when missing, launch the Agent Web UI, and open the SSH tunnel. Takes minutes on a cold runtime; the call returns only when the agent is reachable. Restarting an already running agent is safe.",
		annotations: { destructiveHint: false },
		inputSchema: {
			apiKey: z
				.string()
				.min(1)
				.optional()
				.describe("Provider API key; saved to the backend config when set."),
			baseUrl: z.string().url().optional(),
			model: z.string().min(1).optional(),
			imageGeneration: z
				.boolean()
				.optional()
				.describe(
					"Let the agent call the image MCP tool and start the Colab GPU from a chat message.",
				),
			identity: identitySchema.optional(),
		},
	},
	async (args, extra) => {
		try {
			const state = await api<DshState>("/state", { signal: extra.signal });
			if (!state.hasKey && !args.apiKey)
				throw new Error(
					"No API key is saved on the backend. Pass apiKey to dsh_start or save one with dsh_configure.",
				);
			return textResult(await api("/start", { method: "POST", body: args, signal: extra.signal }));
		} catch (error) {
			return failure(error);
		}
	},
);

server.registerTool(
	"dsh_stop",
	{
		title: "Stop the DSH agent",
		description:
			"Stop the agent Web UI and close the SSH tunnel. The Colab session stays alive, so a later dsh_start is fast.",
		annotations: { destructiveHint: true },
		inputSchema: {},
	},
	async (_args, extra) => {
		try {
			return textResult(await api("/stop", { method: "POST", signal: extra.signal }));
		} catch (error) {
			return failure(error);
		}
	},
);

server.registerTool(
	"dsh_delete_session",
	{
		title: "Delete the Colab session",
		description:
			"Stop the agent and delete its Colab session. Saved settings and the snapshot cache stay on the backend. The next start pays the full cold-provision cost.",
		annotations: { destructiveHint: true },
		inputSchema: {},
	},
	async (_args, extra) => {
		try {
			return textResult(
				await api("/session/stop", { method: "POST", signal: extra.signal }),
			);
		} catch (error) {
			return failure(error);
		}
	},
);

server.registerTool(
	"dsh_configure",
	{
		title: "Update DSH agent config",
		description:
			"Patch the saved provider settings and identity on the backend without starting the agent. Identity fields merge; an empty apiKey string clears the stored key. imageGeneration turns the image MCP tool on or off. Changes apply on the next start.",
		annotations: { destructiveHint: false },
		inputSchema: {
			apiKey: z.string().optional(),
			baseUrl: z.string().url().optional(),
			model: z.string().min(1).optional(),
			imageGeneration: z
				.boolean()
				.optional()
				.describe(
					"Let the agent call the image MCP tool and start the Colab GPU from a chat message.",
				),
			identity: identitySchema.optional(),
		},
	},
	async (args, extra) => {
		try {
			return textResult(
				await api("/config", { method: "POST", body: args, signal: extra.signal }),
			);
		} catch (error) {
			return failure(error);
		}
	},
);

server.registerTool(
	"dsh_wait_running",
	{
		title: "Wait for the DSH agent",
		description:
			"Poll the backend until the agent Web UI answers, typically to follow a dsh_start issued elsewhere. Returns the last state; times out with isError when the agent never comes up.",
		annotations: { readOnlyHint: true },
		inputSchema: {
			timeoutMs: z
				.number()
				.int()
				.min(0)
				.max(900_000)
				.default(300_000)
				.describe("Give up after this many milliseconds (default 300000)."),
			intervalMs: z
				.number()
				.int()
				.min(250)
				.max(30_000)
				.default(3000)
				.describe("Delay between polls (default 3000)."),
		},
	},
	async (args, extra) => {
		try {
			const deadline = Date.now() + args.timeoutMs;
			let state = await api<DshState>("/state", { signal: extra.signal });
			while (!state.running && Date.now() < deadline) {
				await sleep(
					Math.min(args.intervalMs, deadline - Date.now()),
					extra.signal,
				);
				state = await api<DshState>("/state", { signal: extra.signal });
			}
			if (!state.running)
				return {
					isError: true,
					content: [
						{
							type: "text" as const,
							text: `The agent did not start within ${args.timeoutMs} ms.\n${JSON.stringify(state, null, 2)}`,
						},
					],
				};
			return textResult(state);
		} catch (error) {
			return failure(error);
		}
	},
);

server.registerTool(
	"dsh_generate_image",
	{
		title: "Generate an image",
		description:
			"Submit an SDXL-Turbo job to the GPU Colab session. Returns a job id immediately; poll it with dsh_image_job. Starting the image session loads the model, so the first job of a session takes minutes.",
		annotations: { destructiveHint: false },
		inputSchema: {
			prompt: z.string().min(1).max(1500),
			width: z.number().int().min(256).max(1024).step(64).optional(),
			height: z.number().int().min(256).max(1024).step(64).optional(),
			seed: z.number().int().min(0).max(0xffffffff).optional(),
		},
	},
	async (args, extra) => {
		try {
			return textResult(
				await api("/generate", { method: "POST", body: args, signal: extra.signal }),
			);
		} catch (error) {
			return failure(error);
		}
	},
);

server.registerTool(
	"dsh_image_job",
	{
		title: "Read an image job",
		description:
			"Fetch one job by id. With waitMs > 0 it polls until the job is ready or failed, so a single call can await a generation.",
		annotations: { readOnlyHint: true },
		inputSchema: {
			id: z.string().min(1).describe("Job id returned by dsh_generate_image."),
			waitMs: z
				.number()
				.int()
				.min(0)
				.max(1_800_000)
				.default(0)
				.describe("Poll until the job settles, up to this many milliseconds."),
		},
	},
	async (args, extra) => {
		try {
			const path = `/generate/${encodeURIComponent(args.id)}`;
			const deadline = Date.now() + args.waitMs;
			let job = await api<ImageJob>(path, { signal: extra.signal });
			while (
				args.waitMs > 0 &&
				job.status !== "ready" &&
				job.status !== "error" &&
				Date.now() < deadline
			) {
				await sleep(Math.min(1000, deadline - Date.now()), extra.signal);
				job = await api<ImageJob>(path, { signal: extra.signal });
			}
			return textResult(job);
		} catch (error) {
			return failure(error);
		}
	},
);

server.registerTool(
	"dsh_qqbot",
	{
		title: "Read the QQ bot binding",
		description:
			"Binding phase for the QQ Bot plugin, including the login QR code as an inline SVG data URL while a scan is pending, and the credential/gateway health once bound.",
		annotations: { readOnlyHint: true },
		inputSchema: {},
	},
	async (_args, extra) => {
		try {
			return textResult(await api("/qqbot", { signal: extra.signal }));
		} catch (error) {
			return failure(error);
		}
	},
);

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write(
	`dsh-mcp: api ${API_URL}${API_TOKEN ? "" : " (no DSH_API_TOKEN set)"}\n`,
);
