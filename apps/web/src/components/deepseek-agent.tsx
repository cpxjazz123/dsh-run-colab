import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ExternalLink,
  Loader2,
  Play,
  Power,
  RefreshCw,
  Save,
} from 'lucide-react'
import type { DshIdentity } from '@dsh-agent/contract'
import { dshQqbotStateSchema, dshStateSchema } from '@dsh-agent/contract'
import { ErrorNotice, Field } from './common'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'

const EMPTY_IDENTITY: DshIdentity = {
  name: 'DeepSeek Agent',
  persona: '',
  personality: '',
  communicationStyle: '',
  instructions: '',
}
function errorMessage(body: unknown) {
  if (typeof body !== 'object' || body === null) return null
  if ('error' in body) {
    const error = body.error
    if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
    )
      return error.message
  }
  return null
}

async function dshCommand(path: string, init?: RequestInit) {
  const response = await fetch(`/api/dsh${path}`, init)
  if (response.ok) return
  const body: unknown = await response.json().catch(() => null)
  throw new Error(
    errorMessage(body) ?? `DSH bridge request failed (${response.status})`,
  )
}

async function dshState() {
  const response = await fetch('/api/dsh/state')
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok)
    throw new Error(
      errorMessage(body) ?? `DSH bridge request failed (${response.status})`,
    )
  return dshStateSchema.parse(body)
}

async function dshQqbot() {
  const response = await fetch('/api/dsh/qqbot')
  if (response.status === 404 || response.status === 502 || response.status === 503)
    return null
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok)
    throw new Error(
      errorMessage(body) ?? `QQ bridge request failed (${response.status})`,
    )
  return dshQqbotStateSchema.parse(body)
}

// DSH marks its auth cookie SameSite=Strict. Keep the agent on the same
// hostname as this page so a browser does not withhold that cookie when the
// link opens from localhost to 127.0.0.1.
function sameSiteAgentUrl(url: string | null) {
  if (!url || typeof window === 'undefined') return url
  const host = window.location.hostname
  if (host !== 'localhost' && host !== '127.0.0.1') return url
  try {
    const parsed = new URL(url)
    parsed.hostname = host
    return parsed.toString()
  } catch {
    return url
  }
}

export function DeepSeekAgent() {
  const state = useQuery({
    queryKey: ['dsh', 'state'],
    queryFn: dshState,
    retry: false,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  })
  const qqbot = useQuery({
    queryKey: ['dsh', 'qqbot'],
    queryFn: dshQqbot,
    enabled: !!state.data?.running,
    retry: false,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  })
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [identity, setIdentity] = useState<DshIdentity>(EMPTY_IDENTITY)
  const [identityLoaded, setIdentityLoaded] = useState(false)

  useEffect(() => {
    if (!baseUrl && state.data?.baseUrl) setBaseUrl(state.data.baseUrl)
    if (!model && state.data?.model) setModel(state.data.model)
    if (!identityLoaded && state.data?.identity) {
      setIdentity(state.data.identity)
      setIdentityLoaded(true)
    }
  }, [
    baseUrl,
    model,
    identityLoaded,
    state.data?.baseUrl,
    state.data?.identity,
    state.data?.model,
  ])

  const start = useMutation({
    mutationFn: () =>
      dshCommand('/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
          ...(model.trim() ? { model: model.trim() } : {}),
          ...(identityLoaded ? { identity } : {}),
        }),
      }),
    onSuccess: () => {
      setApiKey('')
      state.refetch()
    },
  })
  const saveIdentity = useMutation({
    mutationFn: () =>
      dshCommand('/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity }),
      }),
    onSuccess: () => state.refetch(),
  })
  const deleteAgent = useMutation({
    mutationFn: () => dshCommand('/session/stop', { method: 'POST' }),
    onSuccess: () => state.refetch(),
  })

  const busy =
    start.isPending ||
    saveIdentity.isPending ||
    deleteAgent.isPending
  const data = state.data
  const openUrl = sameSiteAgentUrl(data?.url ?? null)
  // Starting a cold runtime installs DSH before it launches the Web UI.
  const canStart = (!!data?.hasKey || !!apiKey.trim()) && !busy

  return (
    <Card className="max-h-[calc(100dvh-7rem)] overflow-y-auto">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">
          DeepSeek Agent
          <Badge variant={data?.running ? 'secondary' : 'outline'}>
            {data?.running ? 'Running' : 'Stopped'}
          </Badge>
          <Badge variant="outline">
            {data?.session.found ? (data.session.status ?? 'Active') : 'No session'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="API key"
            id="dsh-api-key"
          >
            <Input
              id="dsh-api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={data?.hasKey ? 'Saved — leave blank' : 'sk-…'}
              disabled={busy}
            />
          </Field>
          <Field
            label="Base URL"
            id="dsh-base-url"
          >
            <Input
              id="dsh-base-url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.commandcode.ai/provider/v1"
              disabled={busy}
            />
          </Field>
          <Field
            label="Model"
            id="dsh-model"
          >
            <Input
              id="dsh-model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="deepseek/deepseek-v4.1-flash"
              disabled={busy}
            />
          </Field>
        </div>

        {qqbot.data ? (
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <div>
              <h3 className="font-medium">
                {qqbot.data.phase === 'bound' ? 'QQ 机器人' : 'QQ 登录'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {qqbot.data.phase === 'bound'
                  ? 'QQ 机器人绑定状态。'
                  : '用手机 QQ 扫描二维码，即可把这个 Agent 接入 QQ。'}
              </p>
            </div>
            {qqbot.data.phase === 'waiting' ? (
              qqbot.data.qrSvg ? (
                <img
                  src={qqbot.data.qrSvg}
                  alt="QQ 登录二维码"
                  className="mx-auto size-56 rounded-md bg-white p-2"
                />
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="animate-spin" />
                  正在生成二维码…
                </div>
              )
            ) : qqbot.data.phase === 'starting' ||
              qqbot.data.phase === 'saving' ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" />
                {qqbot.data.phase === 'saving'
                  ? '扫码成功，正在保存凭据…'
                  : '正在准备 QQ 登录二维码…'}
              </div>
            ) : qqbot.data.phase === 'bound' ? (
              <div className="space-y-1">
                <p className="text-sm">
                  QQ 机器人已绑定
                  {qqbot.data.appId ? `（AppID: ${qqbot.data.appId}）` : ''}
                </p>
                {qqbot.data.health?.valid === false ? (
                  <p className="text-sm text-destructive">
                    QQ 凭据无效：{qqbot.data.health.error ?? 'AppID/AppSecret 被拒绝'}
                  </p>
                ) : qqbot.data.health?.online ? (
                  <p className="text-sm text-emerald-600">QQ 机器人已在线</p>
                ) : qqbot.data.health?.valid ? (
                  <p className="text-sm text-amber-600">
                    QQ 凭据有效，但 gateway 尚未就绪。
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    QQ 机器人已绑定。
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-destructive">
                QQ 登录失败：{qqbot.data.reason ?? '未知错误'}
              </p>
            )}
            {qqbot.data.url ? (
              <a
                className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
                href={qqbot.data.url}
                target="_blank"
                rel="noreferrer"
              >
                在浏览器中打开登录链接 <ExternalLink />
              </a>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-medium">Identity</h3>
              <p className="text-sm text-muted-foreground">
                Applied on next start.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => saveIdentity.mutate()}
              disabled={busy || !identityLoaded}
            >
              {saveIdentity.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Save />
              )}
              {saveIdentity.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>

          <div className="grid gap-3">
            <Field label="Agent name" id="dsh-agent-name">
              <Input
                id="dsh-agent-name"
                value={identity.name}
                onChange={(event) =>
                  setIdentity((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                maxLength={80}
                placeholder="DeepSeek Agent"
                disabled={busy}
              />
            </Field>
            <Field
              label="Communication style"
              id="dsh-communication-style"
            >
              <Textarea
                id="dsh-communication-style"
                value={identity.communicationStyle}
                onChange={(event) =>
                  setIdentity((current) => ({
                    ...current,
                    communicationStyle: event.target.value,
                  }))
                }
                rows={2}
                maxLength={1000}
                placeholder="Concise, direct, and practical. Lead with the answer, then explain tradeoffs."
                disabled={busy}
              />
            </Field>
          </div>

          <Field label="Persona / role" id="dsh-persona">
            <Textarea
              id="dsh-persona"
              value={identity.persona}
              onChange={(event) =>
                setIdentity((current) => ({
                  ...current,
                  persona: event.target.value,
                }))
              }
              rows={3}
              maxLength={4000}
              placeholder="You are a patient embedded engineering mentor. You explain hardware tradeoffs with concrete examples and encourage the user to reason from first principles."
              disabled={busy}
            />
          </Field>

          <Field label="Personality" id="dsh-personality">
            <Textarea
              id="dsh-personality"
              value={identity.personality}
              onChange={(event) =>
                setIdentity((current) => ({
                  ...current,
                  personality: event.target.value,
                }))
              }
              rows={2}
              maxLength={2000}
              placeholder="Curious, rigorous, and direct. Challenges weak assumptions without being dismissive."
              disabled={busy}
            />
          </Field>

          <Field label="Additional instructions" id="dsh-instructions">
            <Textarea
              id="dsh-instructions"
              value={identity.instructions}
              onChange={(event) =>
                setIdentity((current) => ({
                  ...current,
                  instructions: event.target.value,
                }))
              }
              rows={3}
              maxLength={8000}
              placeholder="Prefer Chinese when the user writes in Chinese. Never invent citations. Ask before destructive commands."
              disabled={busy}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => state.refetch()}
            disabled={busy}
          >
            <RefreshCw />
            Refresh
          </Button>
          <Button
            type="button"
            onClick={() => start.mutate()}
            disabled={!canStart}
          >
            {start.isPending ? <Loader2 className="animate-spin" /> : <Play />}
            {start.isPending
              ? 'Starting…'
              : data?.running
                ? 'Restart agent'
                : 'Start agent'}
          </Button>
          {openUrl ? (
            <Button asChild variant="outline" disabled={busy}>
              <a href={openUrl} target="_blank" rel="noreferrer">
                Open Agent UI <ExternalLink />
              </a>
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled>
              Open Agent UI
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (
                window.confirm(
                  'Delete Agent? This ends its Colab session. Saved settings remain.',
                )
              )
                deleteAgent.mutate()
            }}
            disabled={busy || !data?.session.found}
          >
            {deleteAgent.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Power />
            )}
            Delete Agent
          </Button>
        </div>

        {state.isError ? <ErrorNotice error={state.error} /> : null}
        <ErrorNotice error={start.error} />
        <ErrorNotice error={saveIdentity.error} />
        <ErrorNotice error={deleteAgent.error} />
      </CardContent>
    </Card>
  )
}
