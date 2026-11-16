#!/usr/bin/env node
/**
 * DeepSeek Harness stdio MCP server for Colab image generation.
 *
 * The bridge starts this script on the DSH VM. It submits a job to the DSH
 * bridge (which owns the Colab CLI and the GPU session), polls until the image
 * is ready, then returns both a public image URL and the image bytes.
 *
 * stdout is reserved for MCP JSON-RPC frames; diagnostics go to stderr.
 */
import process from 'node:process'

const BRIDGE_URL = (process.env.IMAGE_BRIDGE_URL || '')
  .trim()
  .replace(/\/+$/, '')
const BRIDGE_TOKEN = (process.env.IMAGE_BRIDGE_TOKEN || '').trim()
const CALL_TIMEOUT_MS = Number(
  process.env.IMAGE_CALL_TIMEOUT_MS || 45 * 60 * 1000,
)
const POLL_MS = 3000

const TOOL = {
  name: 'generate_image',
  description:
    'Generate an image from a text prompt with a Colab GPU. Use this whenever the user asks for a picture, illustration, photo, logo, poster, concept art, or any other visual. Write a detailed visual prompt. The first call can take several minutes while the GPU installs dependencies and downloads the model; later calls are faster.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        minLength: 1,
        maxLength: 1500,
        description:
          'Detailed description of the image: subject, composition, style, lighting, colors, and mood.',
      },
      width: {
        type: 'integer',
        minimum: 256,
        maximum: 1024,
        multipleOf: 64,
        default: 512,
        description: 'Image width in pixels. Default 512.',
      },
      height: {
        type: 'integer',
        minimum: 256,
        maximum: 1024,
        multipleOf: 64,
        default: 512,
        description: 'Image height in pixels. Default 512.',
      },
      seed: {
        type: 'integer',
        minimum: 0,
        maximum: 4294967295,
        description: 'Optional seed for reproducible images.',
      },
    },
    required: ['prompt'],
    additionalProperties: false,
  },
}

function log(...args) {
  console.error('[dsh-image-mcp]', ...args)
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function bridgeRequest(path, init = {}) {
  if (!BRIDGE_URL) throw new Error('IMAGE_BRIDGE_URL is not configured')
  const headers = new Headers(init.headers)
  if (BRIDGE_TOKEN) headers.set('authorization', `Bearer ${BRIDGE_TOKEN}`)
  if (init.body) headers.set('content-type', 'application/json')
  let lastError = null
  const canRetry = !init.method || init.method === 'GET'
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(`${BRIDGE_URL}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      })
      const text = await response.text()
      let body = null
      try {
        body = text ? JSON.parse(text) : null
      } catch {
        body = null
      }
      if (!response.ok) {
        const message =
          body && typeof body === 'object' && body.error?.message
            ? body.error.message
            : text.trim().slice(-800) || `bridge returned HTTP ${response.status}`
        const error = new Error(message)
        error.status = response.status
        throw error
      }
      return body
    } catch (error) {
      lastError = error
      const status = error instanceof Error ? error.status : undefined
      if (!canRetry || (status && status < 500 && status !== 429)) throw error
      if (attempt === 5) break
      log(
        `bridge request failed (${error instanceof Error ? error.message : String(error)}); retrying`,
      )
      await sleep(1000 * 2 ** attempt)
    }
  }
  throw lastError ?? new Error('bridge request failed')
}

function normalizeDimension(value, fallback) {
  if (value === undefined) return fallback
  const number = Number(value)
  if (
    !Number.isInteger(number) ||
    number < 256 ||
    number > 1024 ||
    number % 64 !== 0
  ) {
    throw new Error('width and height must be integers from 256 to 1024, in steps of 64')
  }
  return number
}

async function generateImage(args) {
  const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : ''
  if (!prompt) throw new Error('prompt is required')
  const width = normalizeDimension(args.width, 512)
  const height = normalizeDimension(args.height, 512)
  const seed =
    args.seed === undefined || args.seed === null ? null : Number(args.seed)
  if (seed !== null && (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff))
    throw new Error('seed must be an unsigned 32-bit integer')

  let job = await bridgeRequest('/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt, width, height, ...(seed === null ? {} : { seed }) }),
  })
  if (!job || typeof job.id !== 'string')
    throw new Error('bridge did not return an image job')
  const deadline = Date.now() + CALL_TIMEOUT_MS
  let lastStatus = ''
  while (job.status !== 'ready' && job.status !== 'error') {
    if (Date.now() >= deadline)
      throw new Error(`image generation timed out while ${job.status}`)
    if (job.status !== lastStatus) {
      lastStatus = job.status
      log(`job ${job.id}: ${job.status}`)
    }
    await sleep(POLL_MS)
    job = await bridgeRequest(`/generate/${encodeURIComponent(job.id)}`)
  }
  if (job.status === 'error')
    throw new Error(job.error || 'image generation failed')
  if (!job.imagePath) throw new Error('bridge returned no image path')

  const response = await fetch(`${BRIDGE_URL}${job.imagePath}`, {
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok)
    throw new Error(`could not download the generated image (HTTP ${response.status})`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length < 1000) throw new Error('generated image is empty')

  const text = [
    `Generated a ${job.width}×${job.height} image with ${job.model}.`,
    job.url ? `![generated image](${job.url})` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  return {
    content: [
      { type: 'text', text },
      {
        type: 'image',
        data: bytes.toString('base64'),
        mimeType: job.mimeType || 'image/jpeg',
      },
    ],
  }
}

async function handle(message) {
  const { id, method, params } = message
  if (typeof method !== 'string') return
  if (method === 'initialize') {
    sendResult(id, {
      protocolVersion:
        typeof params?.protocolVersion === 'string'
          ? params.protocolVersion
          : '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'dsh-image', version: '0.1.0' },
    })
    return
  }
  if (method === 'ping') {
    sendResult(id, {})
    return
  }
  if (method === 'tools/list') {
    sendResult(id, { tools: [TOOL] })
    return
  }
  if (method === 'tools/call') {
    if (params?.name !== TOOL.name) {
      sendError(id, -32602, `unknown tool: ${String(params?.name)}`)
      return
    }
    try {
      sendResult(id, await generateImage(params.arguments || {}))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log('tool failed:', message)
      sendResult(id, {
        content: [{ type: 'text', text: message }],
        isError: true,
      })
    }
    return
  }
  if (method === 'resources/list') {
    sendResult(id, { resources: [] })
    return
  }
  if (method.startsWith('notifications/')) return
  sendError(id, -32601, `method not found: ${method}`)
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let newline = buffer.indexOf('\n')
  while (newline !== -1) {
    const line = buffer.slice(0, newline).replace(/\r$/, '')
    buffer = buffer.slice(newline + 1)
    if (line.trim()) {
      let message
      try {
        message = JSON.parse(line)
      } catch {
        log('ignoring malformed JSON-RPC frame')
      }
      if (message) void handle(message)
    }
    newline = buffer.indexOf('\n')
  }
})

process.stdin.on('end', () => process.exit(0))
process.on('uncaughtException', (error) => {
  log('uncaught exception:', error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
process.on('unhandledRejection', (error) => {
  log('unhandled rejection:', error instanceof Error ? error.stack : String(error))
  process.exit(1)
})

if (!BRIDGE_URL) {
  log('IMAGE_BRIDGE_URL is required')
  process.exit(1)
}
log('ready')
