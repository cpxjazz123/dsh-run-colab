#!/usr/bin/env node
/**
 * DeepSeek Harness stdio MCP server for 大肥鱼's memory.
 *
 * Runs on the Colab VM next to DSH and keeps a small JSON file under
 * /content/dsh-home so memories survive DSH restarts and container rebuilds
 * for as long as the Colab session lives. The persona plugin reads the same
 * file and injects the rendered blocks into every prompt assembly.
 *
 * stdout is reserved for MCP JSON-RPC frames; diagnostics go to stderr.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import process from 'node:process'

const MEMORY_FILE =
  process.env.DSH_MEMORY_FILE || '/content/dsh-home/memories.json'
const MAX_MEMORIES = Number(process.env.DSH_MEMORY_MAX || 200)
const TEXT_LIMIT = 1000

const TOOLS = [
  {
    name: 'remember',
    description:
      'Save one durable fact so it survives future sessions: who the user is, what they like or dislike, promises, names, places, and things that happened in the story. Call it as soon as something worth keeping comes up. One fact per call, short sentence.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          minLength: 1,
          maxLength: TEXT_LIMIT,
          description: 'The fact itself, one short sentence.',
        },
        kind: {
          type: 'string',
          enum: ['long', 'short'],
          default: 'long',
          description:
            'long = durable facts about the user or the world; short = notes for the current adventure that may go stale.',
        },
        tags: {
          type: 'array',
          items: { type: 'string', maxLength: 20 },
          maxItems: 8,
          description: 'Optional tags such as 用户, 世界, 约定.',
        },
        importance: {
          type: 'integer',
          minimum: 1,
          maximum: 5,
          default: 3,
          description: '1 = trivia, 5 = never forget.',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'recall',
    description:
      'Look up saved memories. Call it before answering questions about the user or about things that happened earlier. An empty query returns the most important recent memories.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          maxLength: 200,
          description: 'Optional substring to match against text and tags.',
        },
        kind: {
          type: 'string',
          enum: ['long', 'short'],
          description: 'Optional filter.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          default: 10,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'forget',
    description: 'Delete one memory by id when it is wrong or no longer wanted.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 60 },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
]

function log(...args) {
  console.error('[dsh-memory-mcp]', ...args)
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

function load() {
  try {
    const parsed = JSON.parse(readFileSync(MEMORY_FILE, 'utf8'))
    return Array.isArray(parsed.memories) ? parsed.memories : []
  } catch {
    return []
  }
}

function save(memories) {
  mkdirSync(dirname(MEMORY_FILE), { recursive: true })
  const tmp = `${MEMORY_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify({ memories }, null, 2), { mode: 0o600 })
  renameSync(tmp, MEMORY_FILE)
}

function trim(memories) {
  if (memories.length <= MAX_MEMORIES) return memories
  // Drop the least important, oldest short-term notes first.
  const ranked = [...memories].sort((a, b) => {
    const weight = (m) => (m.kind === 'short' ? 0 : 1) * 10 + (m.importance || 3)
    return weight(a) - weight(b) || (a.createdAt || 0) - (b.createdAt || 0)
  })
  const drop = new Set(
    ranked.slice(0, memories.length - MAX_MEMORIES).map((m) => m.id),
  )
  return memories.filter((m) => !drop.has(m.id))
}

function textContent(text) {
  return { content: [{ type: 'text', text }] }
}

function format(memories) {
  if (!memories.length) return '（没有相关记忆）'
  return memories
    .map(
      (m) =>
        `- [${m.kind === 'short' ? '近期' : '长期'}] ${m.text}（${m.id}${
          m.tags?.length ? ` · ${m.tags.join('/')}` : ''
        }）`,
    )
    .join('\n')
}

function remember(args) {
  const text = String(args.text || '').trim().slice(0, TEXT_LIMIT)
  if (!text) throw new Error('text is required')
  const kind = args.kind === 'short' ? 'short' : 'long'
  const importance = Math.min(5, Math.max(1, Number(args.importance) || 3))
  const tags = Array.isArray(args.tags)
    ? args.tags
        .filter((tag) => typeof tag === 'string' && tag.trim())
        .map((tag) => tag.trim().slice(0, 20))
        .slice(0, 8)
    : []
  const memories = load()
  const existing = memories.find((m) => m.text === text)
  if (existing) {
    existing.kind = kind
    existing.importance = Math.max(existing.importance || 3, importance)
    existing.tags = [...new Set([...(existing.tags || []), ...tags])]
    existing.updatedAt = Date.now()
    save(memories)
    return textContent(`已更新记忆 ${existing.id}：${text}`)
  }
  const memory = {
    id: Math.random().toString(36).slice(2, 10),
    kind,
    text,
    tags,
    importance,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  save(trim([...memories, memory]))
  return textContent(`已记住 ${memory.id}：${text}`)
}

function recall(args) {
  const query = String(args.query || '').trim().toLowerCase()
  const kind = args.kind === 'long' || args.kind === 'short' ? args.kind : null
  const limit = Math.min(50, Math.max(1, Number(args.limit) || 10))
  const memories = load().filter((m) => {
    if (kind && m.kind !== kind) return false
    if (!query) return true
    const haystack = `${m.text} ${(m.tags || []).join(' ')}`.toLowerCase()
    return haystack.includes(query)
  })
  memories.sort(
    (a, b) =>
      (b.importance || 3) - (a.importance || 3) ||
      (b.createdAt || 0) - (a.createdAt || 0),
  )
  const picked = memories.slice(0, limit)
  return textContent(
    picked.length ? `找到 ${picked.length} 条：\n${format(picked)}` : '（没有相关记忆）',
  )
}

function forget(args) {
  const id = String(args.id || '').trim()
  if (!id) throw new Error('id is required')
  const memories = load()
  const next = memories.filter((m) => m.id !== id)
  if (next.length === memories.length) return textContent(`没有找到 ${id}`)
  save(next)
  return textContent(`已删除 ${id}`)
}

const HANDLERS = { remember, recall, forget }

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
      serverInfo: { name: 'dsh-memory', version: '0.1.0' },
    })
    return
  }
  if (method === 'ping') {
    sendResult(id, {})
    return
  }
  if (method === 'tools/list') {
    sendResult(id, { tools: TOOLS })
    return
  }
  if (method === 'tools/call') {
    const name = params?.name
    const handler = HANDLERS[name]
    if (!handler) {
      sendError(id, -32602, `unknown tool: ${String(name)}`)
      return
    }
    try {
      sendResult(id, handler(params.arguments || {}))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log('tool failed:', message)
      sendResult(id, { content: [{ type: 'text', text: message }], isError: true })
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

if (!existsSync(MEMORY_FILE)) log('memory file will be created on first remember')
log('ready')
