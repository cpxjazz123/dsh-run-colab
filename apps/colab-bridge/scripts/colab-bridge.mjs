#!/usr/bin/env node
/**
 * Local bridge between the DSH control panel and the DeepSeek Agent on Colab.
 *
 * It owns one named Colab CPU session, installs Node + @deepseek-ai/dsh there,
 * starts the agent Web UI on the VM, and forwards it to localhost.
 *
 * Run: node scripts/colab-bridge.mjs
 * The HTTP API listens on 127.0.0.1:7791 and is proxied by /api/dsh/*.
 */
import http from 'node:http'
import net from 'node:net'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const SESSION = process.env.DSH_SESSION || 'dsh'
const DSH_HOME = '/content/dsh-home'
const DSH_PORT = 3080
const TUNNEL_PORT = 18080
const TUNNEL_BIND = process.env.DSH_TUNNEL_BIND || '127.0.0.1'
const BRIDGE_PORT = Number(process.env.DSH_BRIDGE_PORT || 7791)
// A local bridge binds loopback; a container runtime reaches the container's
// interface, so the image sets both to 0.0.0.0.
const BRIDGE_HOST = process.env.DSH_BRIDGE_HOST || '127.0.0.1'
const COLAB = process.env.COLAB_BIN || '/usr/local/bin/colab'
const KEYRING =
  process.env.PYTHON_KEYRING_BACKEND || 'keyrings.alt.file.PlaintextKeyring'
const CONFIG_DIR = join(homedir(), '.config', 'dsh-agent')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const DEFAULT_BASE_URL = 'https://api.commandcode.ai/provider/v1'
const DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash'
const DEFAULT_IDENTITY = {
  name: 'DeepSeek Agent',
  persona: '',
  personality: '',
  communicationStyle: '',
  instructions: '',
  world: {
    name: '',
    summary: '',
    era: '',
    geography: '',
    factions: '',
    rules: '',
    arc: '',
  },
  characters: [],
}
const PROVIDER_ID = 'commandcode'
const DSH_VERSION = '0.2.2-rc.1'
const CACHE_DIR = join(homedir(), '.cache', 'dsh-agent')
const CACHE_FILE = join(CACHE_DIR, 'dsh-node24.tar.gz')
const REMOTE_SNAPSHOT = '/content/dsh-node24.tar.gz'
const DRIVE_FILE_NAME = 'dsh-agent-node24.tar.gz'
const OAUTH_TOKEN_FILE = join(CONFIG_DIR, 'oauth-token.json')
const GOOGLE_CLOUD_PROJECT = (process.env.GOOGLE_CLOUD_PROJECT || '').trim()
const ENV_API_KEY = (process.env.DEEPSEEK_API_KEY || '').trim()
const ENV_BASE_URL = (process.env.DEEPSEEK_BASE_URL || '').trim()
const ENV_MODEL = (process.env.DEEPSEEK_MODEL || '').trim()
// A hosted deployment cannot hand the browser a loopback URL. The Worker
// proxies the agent UI on this origin instead.
const PUBLIC_URL = (process.env.DSH_PUBLIC_URL || '').trim().replace(/\/$/, '')
const PUBLIC_HOST = (() => {
  if (!PUBLIC_URL) return ''
  try {
    return new URL(PUBLIC_URL).host
  } catch {
    return ''
  }
})()
const COLAB_PYTHON =
  process.env.COLAB_PYTHON || '/root/.local/venvs/colab-cli/bin/python'
const ALLOW_SCRIPTS =
  '@deepseek-ai/dsh-subprocess-local,koffi,node-pty,@google/genai,protobufjs'
const QQBOT_PACKAGE = '@tencent-connect/dsh-qqbot@0.5.5'
const IMAGE_SESSION = process.env.DSH_IMAGE_SESSION || 'image'
const IMAGE_GPU = process.env.DSH_IMAGE_GPU || 'T4'
const IMAGE_MODEL =
  process.env.DSH_IMAGE_MODEL || 'stabilityai/sdxl-turbo'
const IMAGE_DIR = join(CONFIG_DIR, 'images')
const IMAGE_MCP_SOURCE = readFileSync(
  new URL('./image-mcp.mjs', import.meta.url),
  'utf8',
)
const IMAGE_WORKER_SOURCE = readFileSync(
  new URL('./image-worker.py', import.meta.url),
  'utf8',
)
const IMAGE_WORKER_PORT = Number(process.env.DSH_IMAGE_WORKER_PORT || 8199)
const IMAGE_WORKER_PATH = '/content/image-worker.py'
const IMAGE_WORKER_PID = '/content/.image-worker.pid'
const IMAGE_IDLE_STOP_MS = Number(
  process.env.DSH_IMAGE_IDLE_STOP_MS || 5 * 60_000,
)
// The bridge opens a reverse SSH forward so the DSH VM can reach this bridge
// on its own loopback. That keeps the image API off the public origin.
const MCP_TUNNEL_PORT = Number(process.env.DSH_MCP_TUNNEL_PORT || 9341)
const MCP_BRIDGE_URL = `http://127.0.0.1:${MCP_TUNNEL_PORT}`
const IMAGE_PUBLIC_URL = (
  process.env.IMAGE_PUBLIC_URL ||
  PUBLIC_URL ||
  MCP_BRIDGE_URL
)
  .trim()
  .replace(/\/+$/, '')

let tunnelPid = null
let config = loadConfig()
let imageBusy = false
let imageDepsInstalled = false
let imageWorkerReady = false
let imageIdleTimer = null
const imageJobs = new Map()

function normalizeIdentity(value) {
  const source =
    typeof value === 'object' && value !== null ? value : DEFAULT_IDENTITY
  const text = (key, fallback = '') =>
    typeof source[key] === 'string' ? source[key].trim() : fallback
  return {
    name: text('name', DEFAULT_IDENTITY.name) || DEFAULT_IDENTITY.name,
    persona: text('persona'),
    personality: text('personality'),
    communicationStyle: text('communicationStyle'),
    instructions: text('instructions'),
    world: normalizeWorld(source.world),
    characters: normalizeCharacters(source.characters),
  }
}

function normalizeWorld(value) {
  const source = typeof value === 'object' && value !== null ? value : {}
  const text = (key) =>
    typeof source[key] === 'string' ? source[key].trim() : ''
  return {
    name: text('name'),
    summary: text('summary'),
    era: text('era'),
    geography: text('geography'),
    factions: text('factions'),
    rules: text('rules'),
    arc: text('arc'),
  }
}

function normalizeCharacters(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => typeof item === 'object' && item !== null)
    .slice(0, 20)
    .map((item) => {
      const text = (key) =>
        typeof item[key] === 'string' ? item[key].trim() : ''
      return {
        name: text('name'),
        role: text('role'),
        appearance: text('appearance'),
        personality: text('personality'),
        speech: text('speech'),
        relations: text('relations'),
        secret: text('secret'),
      }
    })
}

const IDENTITY_LIMITS = {
  name: 80,
  persona: 4000,
  personality: 2000,
  communicationStyle: 1000,
  instructions: 8000,
}
const WORLD_LIMITS = {
  name: 80,
  summary: 2000,
  era: 2000,
  geography: 4000,
  factions: 4000,
  rules: 4000,
  arc: 4000,
}
const CHARACTER_LIMITS = {
  name: 80,
  role: 200,
  appearance: 1000,
  personality: 1000,
  speech: 1000,
  relations: 1000,
  secret: 1000,
}

function assertIdentityText(value, label, limit) {
  if (value.length > limit)
    throw new Error(`Agent identity field ${label} is too long`)
  if (value.includes('{{'))
    throw new Error(
      `Agent identity field ${label} cannot contain {{…}} template expressions`,
    )
}

function validateIdentity(identity) {
  for (const [key, limit] of Object.entries(IDENTITY_LIMITS))
    assertIdentityText(identity[key], key, limit)
  for (const [key, limit] of Object.entries(WORLD_LIMITS))
    assertIdentityText(identity.world[key], `world.${key}`, limit)
  if (identity.characters.length > 20)
    throw new Error('Agent world has too many characters')
  identity.characters.forEach((character, index) => {
    for (const [key, limit] of Object.entries(CHARACTER_LIMITS))
      assertIdentityText(character[key], `characters[${index}].${key}`, limit)
  })
  if (renderWorldSetting(identity).length > 30000)
    throw new Error('Agent world setting is too long')
}

function loadConfig() {
  let parsed = {}
  try {
    parsed = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
  } catch {
    // A fresh container has no config file. The Worker seeds the settings the
    // panel last saved through DSH_BOOT_CONFIG, so container recreation does
    // not drop them.
    const boot = (process.env.DSH_BOOT_CONFIG || '').trim()
    if (boot) {
      try {
        parsed = JSON.parse(boot)
      } catch {
        parsed = {}
      }
    }
  }
  return {
    apiKey:
      typeof parsed.apiKey === 'string' && parsed.apiKey
        ? parsed.apiKey
        : ENV_API_KEY,
    baseUrl:
      typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim()
        ? parsed.baseUrl.trim()
        : ENV_BASE_URL || DEFAULT_BASE_URL,
    model:
      typeof parsed.model === 'string' && parsed.model.trim()
        ? parsed.model.trim()
        : ENV_MODEL || DEFAULT_MODEL,
    identity: normalizeIdentity(parsed.identity),
    installed: parsed.installed === true,
    snapshot: parsed.snapshot === true,
    driveFileId:
      typeof parsed.driveFileId === 'string' ? parsed.driveFileId : '',
    token: typeof parsed.token === 'string' ? parsed.token : '',
    // Enabled unless explicitly turned off, so existing profiles keep the
    // image MCP tool after upgrading.
    imageGeneration: parsed.imageGeneration !== false,
  }
}

function saveConfig() {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 })
  chmodSync(CONFIG_FILE, 0o600)
}

function colabRun(args, timeout = 120_000, input) {
  return spawnSync(COLAB, args, {
    encoding: 'utf8',
    timeout,
    env: { ...process.env, PYTHON_KEYRING_BACKEND: KEYRING },
    maxBuffer: 16 * 1024 * 1024,
    ...(input === undefined ? {} : { input }),
  })
}

function colabRunAsync(args, timeout = 120_000, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(COLAB, args, {
      env: { ...process.env, PYTHON_KEYRING_BACKEND: KEYRING },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`colab ${args[0]} timed out after ${timeout / 1000}s`))
    }, timeout)
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (status) => {
      clearTimeout(timer)
      resolve({ status, stdout, stderr })
    })
    if (input === undefined) child.stdin.end()
    else child.stdin.end(input)
  })
}

function parseColabStatus(result) {
  const text = `${result.stdout || ''}${result.stderr || ''}`.trim()
  if (result.status !== 0 || !/Hardware:/i.test(text)) {
    return { found: false, text }
  }
  const hardware = /Hardware:\s*([^|\n]+)/i.exec(text)?.[1]?.trim() ?? 'unknown'
  const status = /Status:\s*([^|\n]+)/i.exec(text)?.[1]?.trim() ?? 'unknown'
  return { found: true, hardware, status, text }
}

function colabStatus() {
  return parseColabStatus(colabRun(['status', '-s', SESSION], 30_000))
}

// `/state` is polled every few seconds. Reading the CLI with spawnSync parks
// the whole event loop for the ~3s the call takes, which starves the tunnel
// proxy and every other request, so the poll reads it off-process and reuses a
// very recent answer.
const STATUS_TTL_MS = 4_000
let statusCache = { at: 0, value: null }
let statusPending = null

function invalidateStatus() {
  statusCache = { at: 0, value: null }
}

async function colabStatusCached() {
  if (statusCache.value && Date.now() - statusCache.at < STATUS_TTL_MS)
    return statusCache.value
  statusPending ??= colabRunAsync(['status', '-s', SESSION], 30_000)
    .then(parseColabStatus)
    .catch((error) => ({
      found: false,
      text: error instanceof Error ? error.message : String(error),
    }))
    .finally(() => {
      statusPending = null
    })
  const value = await statusPending
  statusCache = { at: Date.now(), value }
  return value
}

function ensureSession() {
  const status = colabStatus()
  if (status.found) return status
  const result = colabRun(['new', '-s', SESSION], 180_000)
  if (result.status !== 0) {
    throw new Error(
      `colab new failed: ${`${result.stdout || ''}${result.stderr || ''}`.trim().slice(-800)}`,
    )
  }
  return colabStatus()
}

function imageSessionStatus() {
  const result = colabRun(['status', '-s', IMAGE_SESSION], 30_000)
  const text = `${result.stdout || ''}${result.stderr || ''}`.trim()
  if (result.status !== 0 || !/Hardware:/i.test(text)) {
    return { found: false, gpu: false, text }
  }
  const hardware = /Hardware:\s*([^|\n]+)/i.exec(text)?.[1]?.trim() ?? ''
  return {
    found: true,
    gpu: /T4|L4|G4|A100|H100|V100|P100|GPU/i.test(hardware) && !/CPU/i.test(hardware),
    hardware,
    text,
  }
}

async function ensureImageSession() {
  let status = imageSessionStatus()
  if (status.found && !status.gpu) {
    await colabRunAsync(['stop', '-s', IMAGE_SESSION], 120_000)
    status = { found: false, gpu: false }
  }
  if (!status.found) {
    const result = await colabRunAsync(
      ['new', '-s', IMAGE_SESSION, '--gpu', IMAGE_GPU],
      300_000,
    )
    if (result.status !== 0) {
      throw new Error(
        `Could not start the image GPU session: ${`${result.stdout || ''}${result.stderr || ''}`.trim().slice(-800)}`,
      )
    }
    status = imageSessionStatus()
    if (!status.found || !status.gpu) {
      throw new Error('Colab did not allocate a GPU for the image session')
    }
    imageDepsInstalled = false
    imageWorkerReady = false
  }
  return status
}

async function imageDepsReady() {
  const result = await colabRunAsync(
    ['exec', '-s', IMAGE_SESSION, '--timeout', '180'],
    240_000,
    'import diffusers, transformers, torch; print("IMAGE_DEPS_OK")',
  )
  return (
    result.status === 0 &&
    `${result.stdout || ''}${result.stderr || ''}`.includes('IMAGE_DEPS_OK')
  )
}

async function ensureImageDeps() {
  if (imageDepsInstalled) return
  if (await imageDepsReady()) {
    imageDepsInstalled = true
    return
  }
  const result = await colabRunAsync(
    [
      'install',
      '-s',
      IMAGE_SESSION,
      'diffusers',
      'transformers',
      'accelerate',
      'safetensors',
      'pillow',
    ],
    1_200_000,
  )
  if (result.status !== 0) {
    throw new Error(
      `Image dependencies failed to install: ${`${result.stdout || ''}${result.stderr || ''}`.trim().slice(-1000)}`,
    )
  }
  if (!(await imageDepsReady())) {
    throw new Error('Image dependencies installed but could not be imported')
  }
  imageDepsInstalled = true
}

function imageWorkerStartScript() {
  const encoded = Buffer.from(IMAGE_WORKER_SOURCE, 'utf8').toString('base64')
  return `import base64, json, os, subprocess, sys, time, urllib.request
worker_path = ${JSON.stringify(IMAGE_WORKER_PATH)}
pid_path = ${JSON.stringify(IMAGE_WORKER_PID)}
worker_port = ${IMAGE_WORKER_PORT}
model = ${JSON.stringify(IMAGE_MODEL)}
open(worker_path, 'wb').write(base64.b64decode('${encoded}'))
try:
    os.chmod(worker_path, 0o700)
except OSError:
    pass

def healthy():
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{worker_port}/health', timeout=5) as response:
            return json.loads(response.read()).get('ok') is True
    except Exception:
        return False

def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False

if healthy():
    print('IMAGE_WORKER_ALREADY_READY')
    raise SystemExit(0)

if os.path.exists(pid_path):
    try:
        pid = int(open(pid_path).read().strip())
    except Exception:
        pid = None
    if pid and alive(pid):
        for _ in range(450):
            if healthy():
                print('IMAGE_WORKER_READY')
                raise SystemExit(0)
            if not alive(pid):
                break
            time.sleep(2)

log = open('/content/image-worker.log', 'ab', buffering=0)
env = os.environ.copy()
env['DSH_IMAGE_MODEL'] = model
env['DSH_IMAGE_WORKER_PORT'] = str(worker_port)
env['PYTHONUNBUFFERED'] = '1'
process = subprocess.Popen(
    [sys.executable, worker_path],
    stdin=subprocess.DEVNULL,
    stdout=log,
    stderr=log,
    env=env,
    start_new_session=True,
)
open(pid_path, 'w').write(str(process.pid))
for _ in range(450):
    if healthy():
        print('IMAGE_WORKER_READY')
        raise SystemExit(0)
    if process.poll() is not None:
        break
    time.sleep(2)
print('IMAGE_WORKER_START_FAILED')
try:
    print(open('/content/image-worker.log').read()[-4000:])
except Exception:
    pass
raise SystemExit(1)
`
}

async function ensureImageWorker() {
  if (imageWorkerReady) return
  const result = await colabRunAsync(
    ['exec', '-s', IMAGE_SESSION, '--timeout', '1200'],
    1_250_000,
    imageWorkerStartScript(),
  )
  const output = `${result.stdout || ''}${result.stderr || ''}`
  if (
    result.status !== 0 ||
    !/IMAGE_WORKER_(?:ALREADY_)?READY/.test(output)
  ) {
    throw new Error(
      `Image worker failed to start: ${output.trim().slice(-1400) || 'no output'}`,
    )
  }
  imageWorkerReady = true
}

function imageWorkerGenerateScript(prompt, width, height, seed) {
  const payload = JSON.stringify({ prompt, width, height, seed })
  return `import json, urllib.request
payload = json.loads(${JSON.stringify(payload)})
request = urllib.request.Request(
    'http://127.0.0.1:${IMAGE_WORKER_PORT}/generate',
    data=json.dumps(payload).encode('utf-8'),
    headers={'content-type': 'application/json'},
)
with urllib.request.urlopen(request, timeout=1800) as response:
    data = json.load(response)
print('IMAGE_BASE64:' + data['image'])
`
}

function imageUrl(name) {
  return `${IMAGE_PUBLIC_URL}/images/${encodeURIComponent(name)}`
}

function pruneImages() {
  try {
    const files = readdirSync(IMAGE_DIR)
      .filter((name) => name.endsWith('.jpg'))
      .map((name) => ({
        name,
        path: join(IMAGE_DIR, name),
        mtime: statSync(join(IMAGE_DIR, name)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime)
    for (const file of files.slice(20)) {
      try {
        unlinkSync(file.path)
      } catch {
        // another job may have removed it
      }
    }
  } catch {
    // image serving is best effort
  }
}

function clearImageIdleTimer() {
  if (imageIdleTimer) {
    clearTimeout(imageIdleTimer)
    imageIdleTimer = null
  }
}

function scheduleImageIdleStop() {
  clearImageIdleTimer()
  if (!Number.isFinite(IMAGE_IDLE_STOP_MS) || IMAGE_IDLE_STOP_MS <= 0) return
  imageIdleTimer = setTimeout(async () => {
    imageIdleTimer = null
    if (imageBusy) {
      scheduleImageIdleStop()
      return
    }
    imageBusy = true
    try {
      await colabRunAsync(['stop', '-s', IMAGE_SESSION], 120_000)
      imageDepsInstalled = false
      imageWorkerReady = false
      console.log(`image session stopped after ${IMAGE_IDLE_STOP_MS / 1000}s idle`)
    } catch (error) {
      console.error(
        'could not stop idle image session:',
        error instanceof Error ? error.message : String(error),
      )
    } finally {
      imageBusy = false
    }
  }, IMAGE_IDLE_STOP_MS)
  imageIdleTimer.unref?.()
}

async function generateImageJob(jobId, prompt, width, height, seed) {
  clearImageIdleTimer()
  imageBusy = true
  const job = {
    id: jobId,
    status: 'starting',
    prompt,
    width,
    height,
    seed,
    model: IMAGE_MODEL,
    imagePath: null,
    url: null,
    mimeType: 'image/jpeg',
    error: null,
    updatedAt: Date.now(),
  }
  imageJobs.set(jobId, job)
  try {
    await ensureImageSession()
    job.status = 'installing'
    job.updatedAt = Date.now()
    await ensureImageDeps()
    job.status = 'loading'
    job.updatedAt = Date.now()
    await ensureImageWorker()
    job.status = 'generating'
    job.updatedAt = Date.now()
    const result = await colabRunAsync(
      ['exec', '-s', IMAGE_SESSION, '--timeout', '1800'],
      1_900_000,
      imageWorkerGenerateScript(prompt, width, height, seed),
    )
    const output = `${result.stdout || ''}${result.stderr || ''}`
    const encoded = /IMAGE_BASE64:([A-Za-z0-9+/=]+)/.exec(output)?.[1]
    if (result.status !== 0 || !encoded) {
      throw new Error(
        `Image generation failed: ${output.trim().slice(-1200) || 'no image returned'}`,
      )
    }
    const bytes = Buffer.from(encoded, 'base64')
    if (bytes.length < 1000) throw new Error('Generated image is empty')
    mkdirSync(IMAGE_DIR, { recursive: true, mode: 0o700 })
    const name = `${jobId}.jpg`
    writeFileSync(join(IMAGE_DIR, name), bytes, { mode: 0o600 })
    pruneImages()
    job.status = 'ready'
    job.imagePath = `/images/${name}`
    job.url = imageUrl(name)
    job.updatedAt = Date.now()
  } catch (error) {
    imageWorkerReady = false
    job.status = 'error'
    job.error = error instanceof Error ? error.message : String(error)
    job.updatedAt = Date.now()
  } finally {
    imageBusy = false
    scheduleImageIdleStop()
  }
}

function imageJob(jobId) {
  return imageJobs.get(jobId) ?? null
}

async function qqbotState() {
  const binding = await fetchDshJson('/qqbot/im-qqbot/bind')
  let health = null
  try {
    health = await fetchDshJson('/qqbot/im-qqbot/health')
  } catch {
    // Older plugin builds do not expose the health route.
  }
  const effective =
    health?.bound && binding && binding.phase !== 'bound'
      ? { ...binding, phase: 'bound', appId: health.appId ?? binding.appId }
      : binding
  return { ...effective, health }
}

function sshExec(script, input) {
  const result = colabRun(
    ['ssh', '-s', SESSION, '--', 'bash', '-lc', script],
    900_000,
    input,
  )
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
  if (result.status !== 0) {
    throw new Error(`Remote command failed: ${output.slice(-1200)}`)
  }
  return output
}

// Push the current identity to the VM so a running DSH picks it up on the next
// prompt assembly. The persona plugin reads dsh-persona.txt each time, so this
// needs no restart. Silent when the session is down; the next start rewrites it.
async function syncRemotePersona() {
  try {
    const session = await colabStatusCached()
    if (!session.found) return
    const encoded = Buffer.from(personaSectionText(), 'utf8').toString('base64')
    await colabRunAsync(
      [
        'ssh',
        '-s',
        SESSION,
        '--',
        'bash',
        '-lc',
        `mkdir -p ${DSH_HOME} && echo '${encoded}' | base64 -d > ${DSH_HOME}/dsh-persona.txt`,
      ],
      45_000,
    )
  } catch {
    // Best effort: a stopped session gets the file at its next start.
  }
}

function stopTunnel() {
  if (tunnelPid) {
    try {
      process.kill(-tunnelPid, 'SIGTERM')
    } catch {
      try {
        process.kill(tunnelPid, 'SIGTERM')
      } catch {
        // already gone
      }
    }
    tunnelPid = null
  }
}

function probeHttp(port) {
  return new Promise((resolve) => {
    const request = http.get(
      { host: '127.0.0.1', port, path: '/', timeout: 5000 },
      (response) => {
        response.resume()
        resolve(
          (response.statusCode ?? 0) >= 200 && (response.statusCode ?? 0) < 500,
        )
      },
    )
    request.on('timeout', () => {
      request.destroy()
      resolve(false)
    })
    request.on('error', () => resolve(false))
  })
}

function fetchDshJson(path) {
  return new Promise((resolve, reject) => {
    const token = config.token
      ? `${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(config.token)}`
      : ''
    const request = http.get(
      {
        host: '127.0.0.1',
        port: TUNNEL_PORT,
        path: `${path}${token}`,
        timeout: 10_000,
      },
      (response) => {
        let raw = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          raw += chunk
          if (raw.length > 1024 * 1024) request.destroy()
        })
        response.on('end', () => {
          if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
            reject(
              new Error(
                `DSH returned HTTP ${response.statusCode ?? 0}: ${raw.slice(0, 300)}`,
              ),
            )
            return
          }
          try {
            resolve(JSON.parse(raw))
          } catch {
            reject(new Error('DSH returned invalid JSON'))
          }
        })
      },
    )
    request.on('timeout', () => {
      request.destroy()
      reject(new Error('DSH request timed out'))
    })
    request.on('error', reject)
  })
}

async function waitForHttp(port, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await probeHttp(port)) return true
    await sleep(500)
  }
  return false
}

function waitForPort(port, timeoutMs = 20_000) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs
    const attempt = () => {
      const socket = net.connect({ host: '127.0.0.1', port })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() >= deadline) resolve(false)
        else setTimeout(attempt, 300)
      })
    }
    attempt()
  })
}

async function startTunnel() {
  if (await waitForPort(TUNNEL_PORT, 500)) return
  const args = [
    '-N',
    '-L',
    `${TUNNEL_BIND}:${TUNNEL_PORT}:127.0.0.1:${DSH_PORT}`,
    '-R',
    `${MCP_TUNNEL_PORT}:127.0.0.1:${BRIDGE_PORT}`,
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    'UserKnownHostsFile=/dev/null',
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=40',
    '-o',
    'ServerAliveInterval=15',
    '-o',
    'ServerAliveCountMax=4',
    '-o',
    'ExitOnForwardFailure=yes',
    '-o',
    `ProxyCommand=${COLAB} ssh --proxy-mode -s ${SESSION}`,
    `root@colab-${SESSION}`,
  ]
  const child = spawn('ssh', args, {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PYTHON_KEYRING_BACKEND: KEYRING },
  })
  child.unref()
  tunnelPid = child.pid
  if (!(await waitForPort(TUNNEL_PORT, 25_000))) {
    stopTunnel()
    throw new Error('SSH tunnel did not open')
  }
}

function probeScript() {
  return `export PATH=/content/node/bin:$PATH
if [ -x /content/node/bin/dsh ]; then /content/node/bin/dsh --version 2>/dev/null; fi
exit 0`
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForRemoteDsh(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  let output = ''
  while (true) {
    try {
      output = sshExec(probeScript()).trim()
      if (output.includes(DSH_VERSION)) return output
    } catch (error) {
      output = error instanceof Error ? error.message : String(error)
    }
    if (Date.now() >= deadline) return output
    await sleep(3000)
  }
}

function installScript() {
  return `set -e
export PATH=/content/node/bin:$PATH
rm -rf /content/node
mkdir -p /content/node
cd /content/node
curl -fsSL https://nodejs.org/dist/v24.22.2/node-v24.22.2-linux-x64.tar.xz -o node.tar.xz
tar -xJf node.tar.xz --strip-components=1
npm install -g --allow-scripts=${ALLOW_SCRIPTS} @deepseek-ai/dsh@${DSH_VERSION}
npm install -g pnpm@10
export DSH_HOME=/content/dsh-home
/content/node/bin/dsh plugin --profile web add ${QQBOT_PACKAGE} || echo QQBOT_PLUGIN_INSTALL_FAILED
tar -czf ${REMOTE_SNAPSHOT} -C /content node
echo SNAPSHOT_READY
/content/node/bin/dsh --version`
}

function restoreStreamScript() {
  return `set -e
export PATH=/content/node/bin:$PATH
rm -rf /content/node
tar -xzf - -C /content
/content/node/bin/dsh --version`
}

function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function yamlString(value) {
  return `'${value.replace(/'/g, "''")}'`
}

function yamlJson(value) {
  // JSON strings are valid YAML double-quoted scalars, including newlines.
  return JSON.stringify(value)
}

function renderWorldSetting(identity) {
  const world = identity.world
  const characters = identity.characters.filter(
    (character) => character.name || character.role,
  )
  const hasWorld = Object.values(world).some(Boolean)
  if (!hasWorld && characters.length === 0) return ''
  const lines = []
  if (world.name) lines.push(`# ${world.name}`)
  if (world.summary) lines.push(world.summary)
  const section = (title, value) => {
    if (value) lines.push(`## ${title}\n${value}`)
  }
  section('纪元', world.era)
  section('界域与地理', world.geography)
  section('势力', world.factions)
  section('规则与禁忌', world.rules)
  section('当前主线', world.arc)
  if (characters.length) {
    lines.push('## 人物')
    for (const character of characters) {
      lines.push(
        `### ${character.name || '未命名'}${
          character.role ? ` — ${character.role}` : ''
        }`,
      )
      const field = (label, value) => {
        if (value) lines.push(`- ${label}：${value}`)
      }
      field('外貌', character.appearance)
      field('性格', character.personality)
      field('说话方式', character.speech)
      field('关系', character.relations)
      field('秘密', character.secret)
    }
  }
  return lines.join('\n')
}

function identityPrefix() {
  const identity = config.identity
  const name = identity.name.replace(/\s+/g, ' ')
  const parts = [
    `You are ${name}, a character living in the world below. You are not an assistant and never describe yourself as an AI or a model.`,
  ]
  if (identity.persona) parts.push(`Persona:\n${identity.persona}`)
  if (identity.personality) parts.push(`Personality:\n${identity.personality}`)
  if (identity.communicationStyle)
    parts.push(`Communication style:\n${identity.communicationStyle}`)
  const world = renderWorldSetting(identity)
  if (world) parts.push(`World setting:\n${world}`)
  if (MCP_BRIDGE_URL) {
    parts.push(
      'When the user asks for an image, call the mcp__image__generate_image tool and include the returned image or link in your reply.',
    )
  }
  return parts.join('\n\n')
}

function identitySuffix() {
  return config.identity.instructions
    ? `Additional user configuration:\n${config.identity.instructions}`
    : ''
}

function personaSectionText() {
  const identity = config.identity
  const name = identity.name.replace(/\s+/g, ' ')
  const parts = [`Your display name is ${name}.`]
  if (identity.persona) parts.push(`Persona:\n${identity.persona}`)
  if (identity.personality) parts.push(`Personality:\n${identity.personality}`)
  if (identity.communicationStyle)
    parts.push(`Communication style:\n${identity.communicationStyle}`)
  const world = renderWorldSetting(identity)
  if (world) parts.push(`World setting:\n${world}`)
  if (identity.instructions)
    parts.push(`Additional user configuration:\n${identity.instructions}`)
  return parts.join('\n\n')
}

function personaPluginSource() {
  return `import { readFileSync } from 'node:fs'

const PROFILE = '/content/dsh-home/profiles/web/cordis.patch.yml'
const PERSONA_FILE = '/content/dsh-home/dsh-persona.txt'

// The bridge is reachable through the reverse tunnel, so a panel save lands
// within a couple of seconds. The file and the start-time text are fallbacks.
let cachedPersona = ''
let personaLoaded = false

async function refreshPersona(url, token) {
  if (!url) return
  try {
    const response = await fetch(url, {
      headers: token ? { authorization: 'Bearer ' + token } : {},
    })
    if (!response.ok) return
    cachedPersona = await response.text()
    personaLoaded = true
  } catch {
    // Keep the last known persona.
  }
}

function personaText(fallback) {
  if (personaLoaded) return cachedPersona
  try {
    return readFileSync(PERSONA_FILE, 'utf8')
  } catch {
    return fallback || ''
  }
}
let healthCache = null
let healthCacheAt = 0

function credentials() {
  try {
    const text = readFileSync(PROFILE, 'utf8')
    const start = text.indexOf('- id: im-qqbot')
    if (start < 0) return null
    const end = text.indexOf('\\n- ', start + 1)
    const block = text.slice(start, end < 0 ? undefined : end)
    const lines = block.split('\\n')
    const value = (key) => {
      const line = lines.find((item) => item.trim().startsWith(key + ':'))
      if (!line) return ''
      return line
        .slice(line.indexOf(':') + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '')
    }
    return { appId: value('appId'), appSecret: value('appSecret') }
  } catch {
    return null
  }
}

async function health() {
  if (healthCache && Date.now() - healthCacheAt < 10000) return healthCache
  const creds = credentials()
  if (!creds || !creds.appId || !creds.appSecret) {
    return { bound: false, valid: false, online: false, error: 'QQ 凭据未配置' }
  }
  let valid = false
  let error = ''
  try {
    const response = await fetch('https://api.bot.qq.com/app/getAppAccessToken', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        appId: creds.appId,
        clientSecret: creds.appSecret,
      }),
      signal: AbortSignal.timeout(8000),
    })
    const body = await response.json().catch(() => null)
    valid = Boolean(body && body.access_token)
    if (!valid) {
      error = body && body.message
        ? body.message
        : 'QQ API 拒绝 AppID/AppSecret'
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause)
  }
  let online = false
  if (valid) {
    try {
      const log = readFileSync('/content/dsh-home/web.log', 'utf8')
      online = log.includes('Bot ready! appId=' + creds.appId)
    } catch {
      online = false
    }
  }
  healthCache = {
    bound: true,
    appId: creds.appId,
    valid,
    online,
    error: valid ? null : error,
  }
  healthCacheAt = Date.now()
  return healthCache
}

function send(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

export const name = 'dsh-persona'
export const inject = ['systemPrompt']
export function apply(ctx, config) {
  void refreshPersona(config.url, config.token)
  const timer = setInterval(() => {
    void refreshPersona(config.url, config.token)
  }, 2000)
  ctx.effect(() => () => clearInterval(timer), 'dsh.persona.refresh')
  ctx.effect(() =>
    ctx.systemPrompt.section({
      name: 'dsh:persona',
      order: 10201,
      text: () => personaText(config.text),
      interpolate: false,
    }),
    'dsh.persona',
  )
  if (typeof ctx.inject !== 'function') return
  ctx.inject(['webServer'], (scoped) => {
    const webServer = scoped.webServer
    if (!webServer || typeof webServer.register !== 'function') return
    const dispose = webServer.register({
      kind: 'exact',
      path: '/qqbot/im-qqbot/health',
      handler: async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          send(res, 405, { error: 'method not allowed' })
          return
        }
        try {
          send(res, 200, await health())
        } catch (cause) {
          send(res, 500, {
            error: cause instanceof Error ? cause.message : String(cause),
          })
        }
      },
    })
    ctx.effect(() => dispose, 'dsh.qqbot.health')
  })
}
`
}

function startScript() {
  const quotedKey = `'${config.apiKey.replace(/'/g, `'\\''`)}'`
  const quotedBase = `'${config.baseUrl.replace(/'/g, `'\\''`)}'`
  const quotedModel = `'${config.model.replace(/'/g, `'\\''`)}'`
  const envFile = [
    `export DEEPSEEK_API_KEY=${quotedKey}`,
    `export DEEPSEEK_BASE_URL=${quotedBase}`,
    `export DEEPSEEK_MODEL=${quotedModel}`,
  ].join('\n')
  const personaPlugin = `- insert:
    - id: dsh-persona
      name: ${yamlJson(join(DSH_HOME, 'dsh-persona.mjs'))}
      config:
        text: ${yamlJson(personaSectionText())}
        url: ${yamlJson(MCP_BRIDGE_URL ? `${MCP_BRIDGE_URL}/persona` : '')}
        token: ${yamlJson(process.env.DSH_BRIDGE_TOKEN || '')}
`
  const imageMcp = MCP_BRIDGE_URL && config.imageGeneration
    ? `- insert:
    - id: mcp-image
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: image
        transport: stdio
        command: /content/node/bin/node
        args:
          - ${yamlJson(join(DSH_HOME, 'image-mcp.mjs'))}
        env:
          IMAGE_BRIDGE_URL: ${yamlJson(MCP_BRIDGE_URL)}
          IMAGE_BRIDGE_TOKEN: ${yamlJson('')}
        toolCallTimeoutMs: 2700000
        startupTimeoutMs: 20000
        failOnStartupError: false
        reconnect:
          enabled: true
          maxAttempts: 30
          maxDelayMs: 30000
`
    : ''
  const patch = `- id: llm-pi-ai
  config:
    providers:
      ${PROVIDER_ID}:
        displayName: CommandCode
        apiKeyEnv: DEEPSEEK_API_KEY
        api: openai-completions
        baseURL: ${yamlString(config.baseUrl)}
        models:
          - id: ${yamlString(config.model)}
            name: ${yamlString(config.model)}
- id: agent-default-model
  config:
    provider: ${PROVIDER_ID}
    model: ${yamlString(config.model)}
- id: system-prompt
  config:
    personaPrefix: ${yamlJson(identityPrefix())}
    personaSuffix: ${yamlJson(identitySuffix())}
${personaPlugin}${imageMcp}- id: workspace-controller
  config:
    documentsDirectory: /root
- id: working-directory
  config:
    defaultDirectory: /root
`
  const encoded = Buffer.from(envFile, 'utf8').toString('base64')
  const encodedPatch = Buffer.from(patch, 'utf8').toString('base64')
  const encodedMcp = Buffer.from(IMAGE_MCP_SOURCE, 'utf8').toString('base64')
  const encodedPersona = Buffer.from(
    personaPluginSource(),
    'utf8',
  ).toString('base64')
  const encodedPersonaText = Buffer.from(
    personaSectionText(),
    'utf8',
  ).toString('base64')
  const publicFlags =
    PUBLIC_URL && PUBLIC_HOST
      ? `--public-url ${shellQuote(`${PUBLIC_URL}/`)} --trusted-host ${shellQuote(PUBLIC_HOST)}`
      : ''
  return `set -e
export PATH=/content/node/bin:$PATH
export DSH_HOME=${DSH_HOME}
mkdir -p "$DSH_HOME" /root
if [ -f "$DSH_HOME/web.pid" ]; then
  kill "$(cat "$DSH_HOME/web.pid")" 2>/dev/null || true
  sleep 1
fi
echo '${encoded}' | base64 -d > "$DSH_HOME/env.sh"
chmod 600 "$DSH_HOME/env.sh"
echo '${encodedPatch}' | base64 -d > "$DSH_HOME/minimax.patch.yml"
echo '${encodedMcp}' | base64 -d > "$DSH_HOME/image-mcp.mjs"
chmod 600 "$DSH_HOME/image-mcp.mjs"
echo '${encodedPersona}' | base64 -d > "$DSH_HOME/dsh-persona.mjs"
echo '${encodedPersonaText}' | base64 -d > "$DSH_HOME/dsh-persona.txt"
chmod 600 "$DSH_HOME/dsh-persona.mjs"
set -a
. "$DSH_HOME/env.sh"
set +a
cd /root
if ! command -v dsh >/dev/null 2>&1; then
  echo 'DSH_MISSING'
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@10
fi
if ! grep -q '@tencent-connect/dsh-qqbot' "$DSH_HOME/profiles/web/package.json" 2>/dev/null; then
  dsh plugin --profile web add ${QQBOT_PACKAGE} || echo QQBOT_PLUGIN_INSTALL_FAILED
fi
nohup dsh web --patch "$DSH_HOME/minimax.patch.yml" --no-open --host 127.0.0.1 --port ${DSH_PORT} ${publicFlags} > "$DSH_HOME/web.log" 2>&1 &
echo $! > "$DSH_HOME/web.pid"
for i in $(seq 1 45); do
  if grep -q 'token=' "$DSH_HOME/web.log" 2>/dev/null; then
    break
  fi
  sleep 1
done
grep -o 'token=[A-Za-z0-9_-]*' "$DSH_HOME/web.log" | tail -1`
}

function stopScript() {
  return `if [ -f ${DSH_HOME}/web.pid ]; then
  kill "$(cat ${DSH_HOME}/web.pid)" 2>/dev/null || true
  rm -f ${DSH_HOME}/web.pid
fi
pkill -f 'dsh web' 2>/dev/null || true`
}

async function state() {
  const session = await colabStatusCached()
  const portOpen = await waitForPort(TUNNEL_PORT, 300)
  const running = portOpen ? await probeHttp(TUNNEL_PORT) : false
  return {
    session: {
      name: SESSION,
      found: session.found,
      hardware: session.hardware ?? null,
      status: session.status ?? null,
    },
    installed: config.installed,
    snapshot: existsSync(CACHE_FILE),
    drive: !!config.driveFileId,
    running,
    hasKey: !!config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    identity: config.identity,
    imageGeneration: config.imageGeneration,
    url: portOpen
      ? `${PUBLIC_URL || `http://127.0.0.1:${TUNNEL_PORT}`}/${config.token ? `?token=${encodeURIComponent(config.token)}` : ''}`
      : null,
  }
}

// Reuse the authorized Colab CLI installed-app OAuth token (drive.file), or a
// custom installed-app token JSON at ~/.config/dsh-agent/oauth-token.json.
function loadOauthToken() {
  const envToken = (process.env.COLAB_OAUTH_TOKEN || '').trim()
  if (envToken) return JSON.parse(envToken)
  if (existsSync(OAUTH_TOKEN_FILE)) {
    return JSON.parse(readFileSync(OAUTH_TOKEN_FILE, 'utf8'))
  }
  const result = spawnSync(
    COLAB_PYTHON,
    [
      '-c',
      "import keyring; print(keyring.get_password('google-colab-cli','oauth_token') or '')",
    ],
    {
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, PYTHON_KEYRING_BACKEND: KEYRING },
    },
  )
  const raw = (result.stdout || '').trim()
  if (result.status !== 0 || !raw) {
    throw new Error(
      'No Drive OAuth token. Authorize the Colab CLI or place an installed-app token at ~/.config/dsh-agent/oauth-token.json.',
    )
  }
  return JSON.parse(raw)
}

async function driveAccessToken() {
  const token = loadOauthToken()
  if (
    token.token &&
    token.expiry &&
    new Date(token.expiry).getTime() > Date.now() + 60_000
  ) {
    return token.token
  }
  const body = new URLSearchParams({
    client_id: token.client_id,
    client_secret: token.client_secret,
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token',
  })
  const response = await fetch(
    token.token_uri || 'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    },
  )
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.access_token) {
    throw new Error(`Drive token refresh failed (${response.status})`)
  }
  return data.access_token
}

function driveHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    ...(GOOGLE_CLOUD_PROJECT
      ? { 'x-goog-user-project': GOOGLE_CLOUD_PROJECT }
      : {}),
  }
}

async function driveFind(token) {
  if (!GOOGLE_CLOUD_PROJECT) {
    throw new Error(
      'Set GOOGLE_CLOUD_PROJECT to a Google Cloud project with the Drive API enabled',
    )
  }
  if (config.driveFileId) return config.driveFileId
  const query = encodeURIComponent(
    `name = '${DRIVE_FILE_NAME}' and trashed = false`,
  )
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive&fields=files(id,name,size)`,
    { headers: driveHeaders(token) },
  )
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Drive lookup failed (${response.status})`)
  const file = data.files?.[0]
  if (!file) return null
  config.driveFileId = file.id
  saveConfig()
  return file.id
}

async function driveUpload() {
  if (!existsSync(CACHE_FILE)) throw new Error('local snapshot missing')
  const token = await driveAccessToken()
  const existing = await driveFind(token)
  const buffer = readFileSync(CACHE_FILE)
  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=resumable&fields=id,name,size`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size'
  const initiated = await fetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: {
      ...driveHeaders(token),
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-type': 'application/gzip',
      'x-upload-content-length': String(buffer.length),
    },
    body: JSON.stringify(existing ? {} : { name: DRIVE_FILE_NAME }),
  })
  if (!initiated.ok) {
    throw new Error(`Drive upload init failed (${initiated.status})`)
  }
  const location = initiated.headers.get('location')
  if (!location) throw new Error('Drive upload did not return a session URL')

  const chunkSize = 8 * 1024 * 1024
  let offset = 0
  let uploaded = null
  while (offset < buffer.length) {
    const end = Math.min(offset + chunkSize, buffer.length)
    const response = await fetch(location, {
      method: 'PUT',
      headers: {
        'content-range': `bytes ${offset}-${end - 1}/${buffer.length}`,
        'content-length': String(end - offset),
      },
      body: buffer.subarray(offset, end),
    })
    if (response.status !== 308) {
      if (!response.ok) {
        throw new Error(`Drive chunk upload failed (${response.status})`)
      }
      uploaded = await response.json().catch(() => null)
    }
    offset = end
  }
  const id = uploaded?.id ?? existing
  if (!id) throw new Error('Drive upload did not return a file id')
  config.driveFileId = id
  saveConfig()
}

async function driveDownload() {
  const token = await driveAccessToken()
  const id = await driveFind(token)
  if (!id) return false
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
    { headers: driveHeaders(token) },
  )
  if (!response.ok)
    throw new Error(`Drive download failed (${response.status})`)
  const buffer = Buffer.from(await response.arrayBuffer())
  mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 })
  writeFileSync(CACHE_FILE, buffer, { mode: 0o600 })
  return true
}

/**
 * Download the snapshot on the Colab VM itself. The bridge only sends a
 * short-lived access token over SSH stdin; the 256MB tar never crosses the
 * Cloudflare Container. This avoids the Drive -> container -> Colab double
 * transfer that made a cold start exceed the Container request lifetime.
 */
async function driveRemoteInstall() {
  const token = await driveAccessToken()
  const id = await driveFind(token)
  if (!id) return ''
  const headers = `/content/.drive-headers`
  const headerLines = [`Authorization: Bearer ${token}`]
  if (GOOGLE_CLOUD_PROJECT) {
    headerLines.push(`x-goog-user-project: ${GOOGLE_CLOUD_PROJECT}`)
  }
  sshExec(`umask 077; cat > ${headers}`, `${headerLines.join('\n')}\n`)
  return sshExec(`set -euo pipefail
export PATH=/content/node/bin:$PATH
trap 'rm -f ${headers}' EXIT
rm -rf /content/node
curl --fail --location --silent --show-error -H @${headers} \\
  "https://www.googleapis.com/drive/v3/files/${id}?alt=media" \\
  | tar -xzf - -C /content
/content/node/bin/dsh --version`)
}

function downloadCache() {
  mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 })
  const result = colabRun(
    ['download', '-s', SESSION, REMOTE_SNAPSHOT, CACHE_FILE],
    900_000,
  )
  if (result.status !== 0) {
    throw new Error(
      `colab download failed: ${`${result.stdout || ''}${result.stderr || ''}`.trim().slice(-800)}`,
    )
  }
  try {
    sshExec(`rm -f ${REMOTE_SNAPSHOT}`)
  } catch {
    // the cache is already local; a leftover remote tarball is harmless
  }
}

async function install() {
  stopTunnel()
  ensureSession()
  let output = sshExec(probeScript()).trim()

  if (output.includes(DSH_VERSION)) {
    output = 'ALREADY_INSTALLED'
    if (!existsSync(CACHE_FILE)) {
      try {
        sshExec(`tar -czf ${REMOTE_SNAPSHOT} -C /content node`)
        downloadCache()
      } catch (error) {
        output += `\nCACHE_WRITE_FAILED: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  } else {
    let installedRemotely = false
    if (!existsSync(CACHE_FILE)) {
      try {
        const remote = await driveRemoteInstall()
        if (remote) {
          output = `DRIVE_REMOTE\n${remote}`
          installedRemotely = true
        }
      } catch (error) {
        output = `DRIVE_REMOTE_FAILED: ${error instanceof Error ? error.message : String(error)}`
      }
    }
    if (!installedRemotely) {
      if (!existsSync(CACHE_FILE)) {
        try {
          if (await driveDownload()) output += '\nDRIVE_DOWNLOADED'
        } catch (error) {
          output += `\nDRIVE_DOWNLOAD_FAILED: ${error instanceof Error ? error.message : String(error)}`
        }
      }
      if (existsSync(CACHE_FILE)) {
        output += '\nRESTORING_CACHE'
        try {
          output += `\n${sshExec(restoreStreamScript(), readFileSync(CACHE_FILE))}`
        } catch (error) {
          output += `\nCACHE_RESTORE_FAILED: ${error instanceof Error ? error.message : String(error)}`
          output += `\n${sshExec(installScript())}`
          try {
            downloadCache()
          } catch (downloadError) {
            output += `\nCACHE_WRITE_FAILED: ${downloadError instanceof Error ? downloadError.message : String(downloadError)}`
          }
        }
      } else {
        output = `INSTALLING\n${sshExec(installScript())}`
        try {
          downloadCache()
        } catch (error) {
          output += `\nCACHE_WRITE_FAILED: ${error instanceof Error ? error.message : String(error)}`
        }
      }
    }
  }

  if (existsSync(CACHE_FILE) && !config.driveFileId) {
    try {
      await driveUpload()
      output += '\nDRIVE_UPLOADED'
    } catch (error) {
      output += `\nDRIVE_UPLOAD_FAILED: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  config.installed = true
  config.snapshot = existsSync(CACHE_FILE)
  saveConfig()
  return { output: output.slice(-2000), state: await state() }
}

async function start() {
  stopTunnel()
  ensureSession()
  invalidateStatus()
  let output = await waitForRemoteDsh(3000)
  let restored = ''
  if (!output.includes(DSH_VERSION)) {
    const repair = await install()
    restored = `REMOTE_RESTORE\n${repair.output}`
    output = await waitForRemoteDsh(120_000)
    if (!output.includes(DSH_VERSION)) {
      throw new Error(
        `DSH is missing on the runtime and could not be restored: ${output.slice(-500) || 'no version returned'}; ${repair.output.slice(-1000)}`,
      )
    }
  }
  output = `${restored}${restored ? '\n' : ''}${sshExec(startScript())}`
  const token = /token=([A-Za-z0-9_-]+)/.exec(output)?.[1] ?? ''
  config.installed = true
  config.token = token
  saveConfig()
  // The SSH tunnel must be opened after the one-shot start command releases
  // the Colab SSH session; MCP reconnects to the reverse-forwarded bridge.
  await startTunnel()
  if (!(await waitForHttp(TUNNEL_PORT))) {
    stopTunnel()
    throw new Error(
      'Agent did not respond through the SSH tunnel; check the Colab session',
    )
  }
  return { output: output.slice(-2000), state: await state() }
}

async function stop() {
  stopTunnel()
  invalidateStatus()
  let output = ''
  try {
    output = sshExec(stopScript())
  } catch (error) {
    output = error instanceof Error ? error.message : String(error)
  }
  config.token = ''
  saveConfig()
  return { output, state: await state() }
}

async function stopSession() {
  stopTunnel()
  const result = colabRun(['stop', '-s', SESSION], 120_000)
  invalidateStatus()
  config.token = ''
  saveConfig()
  return {
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
    state: await state(),
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 64 * 1024) reject(new Error('request too large'))
    })
    req.on('end', () => {
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

function updateIdentity(body) {
  if (typeof body.identity !== 'object' || body.identity === null) return
  const identity = normalizeIdentity({ ...config.identity, ...body.identity })
  validateIdentity(identity)
  config.identity = identity
}

function send(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${BRIDGE_PORT}`)
  try {
    if (req.method === 'GET' && url.pathname === '/persona') {
      const expected = `Bearer ${process.env.DSH_BRIDGE_TOKEN || ''}`
      const provided = req.headers.authorization || ''
      const allowed =
        !process.env.DSH_BRIDGE_TOKEN ||
        (provided.length === expected.length &&
          Buffer.from(provided).equals(Buffer.from(expected)))
      if (!allowed) return send(res, 401, { error: { message: 'unauthorized' } })
      res.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      })
      return res.end(personaSectionText())
    }
    if (req.method === 'GET' && url.pathname === '/state') {
      return send(res, 200, await state())
    }
    if (req.method === 'GET' && url.pathname === '/qqbot') {
      try {
        return send(res, 200, await qqbotState())
      } catch (error) {
        return send(res, 502, {
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        })
      }
    }
    if (req.method === 'GET' && url.pathname.startsWith('/images/')) {
      const name = url.pathname.slice('/images/'.length)
      if (!/^[a-f0-9-]+\.jpg$/i.test(name)) {
        return send(res, 404, { error: { message: 'not found' } })
      }
      try {
        const image = readFileSync(join(IMAGE_DIR, name))
        res.writeHead(200, {
          'content-type': 'image/jpeg',
          'content-length': image.length,
          'cache-control': 'public, max-age=3600',
        })
        return res.end(image)
      } catch {
        return send(res, 404, { error: { message: 'not found' } })
      }
    }
    if (req.method === 'GET' && url.pathname.startsWith('/generate/')) {
      const jobId = url.pathname.slice('/generate/'.length)
      if (!/^[a-f0-9-]+$/i.test(jobId)) {
        return send(res, 404, { error: { message: 'not found' } })
      }
      const job = imageJob(jobId)
      if (!job) return send(res, 404, { error: { message: 'job not found' } })
      return send(res, 200, job)
    }
    if (req.method === 'POST' && url.pathname === '/generate') {
      const body = await readBody(req)
      const prompt =
        typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 1500) : ''
      if (!prompt) {
        return send(res, 400, {
          error: { message: 'Describe the image first.' },
        })
      }
      const dimension = (value) => {
        if (value === undefined) return 512
        const number = Number(value)
        if (
          !Number.isInteger(number) ||
          number < 256 ||
          number > 1024 ||
          number % 64 !== 0
        ) {
          return null
        }
        return number
      }
      const width = dimension(body.width)
      const height = dimension(body.height)
      if (width === null || height === null) {
        return send(res, 400, {
          error: { message: 'width and height must be 256..1024 in steps of 64' },
        })
      }
      let seed = null
      if (body.seed !== undefined && body.seed !== null) {
        seed = Number(body.seed)
        if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
          return send(res, 400, {
            error: { message: 'seed must be an unsigned 32-bit integer' },
          })
        }
      }
      if (imageBusy) {
        return send(res, 409, {
          error: { message: 'An image is already being generated.' },
        })
      }
      const id = randomUUID()
      void generateImageJob(id, prompt, width, height, seed)
      return send(res, 202, imageJob(id))
    }
    if (req.method === 'POST' && url.pathname === '/install') {
      return send(res, 200, await install())
    }
    if (req.method === 'POST' && url.pathname === '/start') {
      const body = await readBody(req)
      if (typeof body.apiKey === 'string' && body.apiKey.trim())
        config.apiKey = body.apiKey.trim()
      if (typeof body.baseUrl === 'string' && body.baseUrl.trim())
        config.baseUrl = body.baseUrl.trim()
      if (typeof body.model === 'string' && body.model.trim())
        config.model = body.model.trim()
      updateIdentity(body)
      if (typeof body.imageGeneration === 'boolean')
        config.imageGeneration = body.imageGeneration
      saveConfig()
      return send(res, 200, await start())
    }
    if (req.method === 'POST' && url.pathname === '/stop') {
      return send(res, 200, await stop())
    }
    if (req.method === 'POST' && url.pathname === '/session/stop') {
      return send(res, 200, await stopSession())
    }
    if (req.method === 'POST' && url.pathname === '/config') {
      const body = await readBody(req)
      if (typeof body.apiKey === 'string') config.apiKey = body.apiKey.trim()
      if (typeof body.baseUrl === 'string' && body.baseUrl.trim())
        config.baseUrl = body.baseUrl.trim()
      if (typeof body.model === 'string' && body.model.trim())
        config.model = body.model.trim()
      updateIdentity(body)
      if (typeof body.imageGeneration === 'boolean')
        config.imageGeneration = body.imageGeneration
      saveConfig()
      // Identity changes are hot: the running agent reloads the persona file
      // on its next prompt assembly.
      void syncRemotePersona()
      return send(res, 200, await state())
    }
    return send(res, 404, { error: { message: 'not found' } })
  } catch (error) {
    return send(res, 500, {
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    })
  }
})

server.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
  console.log(`DSH bridge listening on http://${BRIDGE_HOST}:${BRIDGE_PORT}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopTunnel()
    server.close(() => process.exit(0))
  })
}
