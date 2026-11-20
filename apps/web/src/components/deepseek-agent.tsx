import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
	ChevronDown,
	ExternalLink,
	Loader2,
	Play,
	RefreshCw,
	Save,
	Sparkles,
	Trash2,
} from 'lucide-react'
import type { DshIdentity } from '@dsh-agent/contract'
import { dshQqbotStateSchema, dshStateSchema } from '@dsh-agent/contract'
import { AccountBar } from './account'
import { ErrorNotice, Field } from './common'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { cn } from '#/lib/utils'

const EMPTY_IDENTITY: DshIdentity = {
	name: 'DeepSeek Agent',
	persona: '',
	personality: '',
	communicationStyle: '',
	instructions: '',
	worldview: '',
}

// Same outline as the anify world documents: era, geography, factions,
// characters, rules, and the current arc.
const WORLDVIEW_TEMPLATE = `# 六重界域

一句话：混沌被源契推演成六重界域，能量从炼狱流向尘寰，暮蚀期开始失衡。

## 纪元
- 当前：第七天兆纪 · 暮蚀期
- 纪年：天兆纪，以重大天兆划分纪元
- 现状：天兆失准、裂隙增多、灵能水晶紧缺

## 界域与地理
- 阿斯忒曼圣庭（天顶界）：星轨谕言的发源地，圣枢院与灵算阁共掌权柄
- 外域虚境：圣庭外围，炼狱外溢的能量在此沉淀成物质
- 派尔洛炼狱：炎核巨人的熔核平原，世界的炉心
- 岩衡古境：地魂守望者回收混乱能量，用地脉震动示警
- 露米妮娅之森：晶灵把炽能调成灵能，剩余结晶为灵能水晶
- 安索弥斯（尘寰界）：凡人的世界，观星殿读天兆，大公堡掌政权
- 暮影秘境：影护者守在界域缝隙，隔绝混乱能量

## 势力
- 圣枢院 · 守序宗：圣谕唯尊，主张集权
- 圣枢院 · 应机宗：应境而变，保留裁量
- 通界司：掌管界域通孔与谕言传递
- 虚寂：叛逃组织，私采异常水晶，寻找跨界的路

## 人物
- 琳恩·特尔：故事收集者，观察这个世界的记录者
- 莉娅·希里尔：曦光晶愈屋医女
- 星黛拉·奥罗莉亚：观星殿天语者候选
- 芬恩·赫拉利亚：石洼落游侠，能看见影护者

## 规则与禁忌
- 谕言不可违抗，但可以被翻译
- 灵能水晶是尘寰唯一可用的能量来源
- 贵族囤积水晶，尘庶在暮蚀期挨冻
- 观测者不得介入（琳恩正在违反这条）

## 当前主线
大肥鱼穿过界域通孔落到暮湾区，随身只有一根木勺；
暮蚀期的裂隙在变多，影护者越来越累。
`

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
	const [imageEnabled, setImageEnabled] = useState(true)
	const [imageLoaded, setImageLoaded] = useState(false)

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

	useEffect(() => {
		if (!imageLoaded && state.data) {
			setImageEnabled(state.data.imageGeneration)
			setImageLoaded(true)
		}
	}, [imageLoaded, state.data])

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
	const toggleImage = useMutation({
		mutationFn: (enabled: boolean) =>
			dshCommand('/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ imageGeneration: enabled }),
			}),
		onSuccess: () => state.refetch(),
		onError: () => setImageEnabled((current) => !current),
	})

	const busy = start.isPending || saveIdentity.isPending || deleteAgent.isPending
	const data = state.data
	const openUrl = sameSiteAgentUrl(data?.url ?? null)
	// Starting a cold runtime installs DSH before it launches the Web UI.
	const canStart = (!!data?.hasKey || !!apiKey.trim()) && !busy

	const loading = state.isPending
	const mood = start.isPending ? 'work' : data?.running ? 'awake' : 'sleep'
	const pill = start.isPending
		? { text: '叫醒中…', cls: 'bg-sunny/70 text-[#6b4b00]', dot: 'bg-[#c98a00]' }
		: loading
			? { text: '连接中…', cls: 'bg-belly text-whale-deep', dot: 'bg-whale' }
			: data?.running
				? { text: '游泳中', cls: 'bg-mint/25 text-[#0f7a52]', dot: 'bg-mint' }
				: { text: '呼呼睡', cls: 'bg-ink/5 text-muted-foreground', dot: 'bg-ink/30' }

	return (
		<section className="animate-pop relative rounded-[2rem] border-2 border-white bg-white/85 p-5 shadow-[0_30px_60px_-32px_rgba(14,36,66,0.45)] backdrop-blur sm:p-8">
			<Button
				type="button"
				variant="ghost"
				size="icon"
				onClick={() => state.refetch()}
				disabled={busy}
				aria-label="刷新状态"
				title="刷新状态"
				className="absolute top-4 right-4 z-10 size-9 rounded-full border-2 border-ink/10 bg-white/80 text-ink shadow-sm backdrop-blur hover:bg-belly"
			>
				<RefreshCw />
			</Button>
			<div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-7">
				<div className="relative shrink-0 -rotate-2">
					<img
						src="/mascot.webp"
						alt="大肥鱼"
						width={640}
						height={666}
						className={cn(
							'w-44 drop-shadow-[0_18px_26px_rgba(43,107,255,0.3)] sm:w-60',
							mood === 'awake' && 'animate-float',
							mood === 'work' && 'animate-hop',
							mood === 'sleep' && 'opacity-95',
						)}
					/>
					{mood === 'sleep' ? (
						<div
							aria-hidden
							className="pointer-events-none absolute -top-3 right-1 flex flex-col items-end font-black text-whale"
						>
							<span className="animate-bob text-2xl leading-none">z</span>
							<span
								className="animate-bob text-lg leading-none"
								style={{ animationDelay: '0.45s' }}
							>
								z
							</span>
							<span
								className="animate-bob text-xs leading-none"
								style={{ animationDelay: '0.9s' }}
							>
								z
							</span>
						</div>
					) : null}
					{mood === 'work' ? (
						<span
							aria-hidden
							className="absolute -top-1 right-2 size-3 animate-ping rounded-full bg-sunny"
						/>
					) : null}
				</div>

				<div className="min-w-0 flex-1 space-y-4">
					<div className="space-y-2 text-center sm:text-left">
						<div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
							<h2 className="text-2xl font-black tracking-tight sm:text-3xl">
								{identity.name || '大肥鱼'}
							</h2>
							<span
								className={cn(
									'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold',
									pill.cls,
								)}
							>
								<span className={cn('size-1.5 rounded-full', pill.dot)} />
								{pill.text}
							</span>
						</div>
					</div>

					<div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
						<Button
							type="button"
							onClick={() => start.mutate()}
							disabled={!canStart}
							className="h-12 rounded-full bg-whale px-6 text-base font-bold text-white shadow-[0_6px_0_#1B4ED8] transition-[transform,box-shadow,background-color] hover:bg-whale-deep active:translate-y-[3px] active:shadow-[0_3px_0_#1B4ED8] disabled:shadow-none"
						>
							{start.isPending ? (
								<Loader2 className="animate-spin" />
							) : (
								<Play />
							)}
							{start.isPending
								? '叫醒中…'
								: data?.running
									? '再叫醒我'
									: '叫醒我'}
						</Button>

						{openUrl ? (
							<Button
								asChild
								variant="outline"
								className="h-12 rounded-full border-2 border-ink/10 bg-white px-5 text-base font-semibold text-ink hover:bg-belly"
							>
								<a href={openUrl} target="_blank" rel="noreferrer">
									打开 Agent UI <ExternalLink />
								</a>
							</Button>
						) : (
							<Button
								type="button"
								variant="outline"
								disabled
								className="h-12 rounded-full border-2 border-ink/10 bg-white px-5 text-base font-semibold"
							>
								打开 Agent UI
							</Button>
						)}
					</div>

					<div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-ink/10 bg-mist/70 px-4 py-2.5 text-left">
						<div className="min-w-0">
							<p className="text-sm font-bold">会在聊天的时候生成图片</p>
						</div>
						<label className="relative inline-flex shrink-0 cursor-pointer items-center">
							<input
								type="checkbox"
								className="peer sr-only"
								checked={imageLoaded && imageEnabled}
								disabled={!imageLoaded || toggleImage.isPending}
								onChange={(event) => {
									const enabled = event.target.checked
									setImageEnabled(enabled)
									toggleImage.mutate(enabled)
								}}
								aria-label="会在聊天的时候生成图片"
							/>
							<span
								aria-hidden
								className="relative block h-8 w-14 rounded-full bg-ink/15 transition-colors peer-checked:bg-whale peer-focus-visible:ring-4 peer-focus-visible:ring-whale/25 peer-disabled:opacity-50 after:absolute after:top-1 after:left-1 after:size-6 after:rounded-full after:bg-white after:shadow after:transition-transform after:content-[''] peer-checked:after:translate-x-6"
							/>
						</label>
					</div>
				</div>
			</div>

			<div className="mt-6 space-y-4">
				<details className="group rounded-3xl border-2 border-dashed border-ink/10 bg-mist/70 px-4 py-2">
					<summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-2 text-sm font-bold text-ink [&::-webkit-details-marker]:hidden">
						<span className="flex items-center gap-2">
							<Sparkles className="size-4 text-whale" />
							设置
							<span className="font-normal text-muted-foreground">
								API Key · 模型 · 人设
							</span>
						</span>
						<ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
					</summary>

					<div className="space-y-5 pb-3 pt-3">
						<div className="grid gap-3 sm:grid-cols-2">
							<Field label="API key" id="dsh-api-key">
								<Input
									id="dsh-api-key"
									type="password"
									autoComplete="off"
									value={apiKey}
									onChange={(event) => setApiKey(event.target.value)}
									placeholder={data?.hasKey ? '已保存，留空即可' : 'sk-…'}
									disabled={busy}
								/>
							</Field>
							<Field label="Model" id="dsh-model">
								<Input
									id="dsh-model"
									value={model}
									onChange={(event) => setModel(event.target.value)}
									placeholder="deepseek/deepseek-v4.1-flash"
									disabled={busy}
								/>
							</Field>
						</div>

						<Field label="Base URL" id="dsh-base-url">
							<Input
								id="dsh-base-url"
								value={baseUrl}
								onChange={(event) => setBaseUrl(event.target.value)}
								placeholder="https://api.commandcode.ai/provider/v1"
								disabled={busy}
							/>
						</Field>

						<div className="grid gap-3 sm:grid-cols-2">
							<Field label="名字" id="dsh-agent-name">
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
							<Field label="说话风格" id="dsh-communication-style">
								<Input
									id="dsh-communication-style"
									value={identity.communicationStyle}
									onChange={(event) =>
										setIdentity((current) => ({
											...current,
											communicationStyle: event.target.value,
										}))
									}
									maxLength={1000}
									placeholder="直接一点，先给结论"
									disabled={busy}
								/>
							</Field>
						</div>

						<Field label="人设 / 角色" id="dsh-persona">
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
								placeholder="你是一条很有耐心的胖鱼，喜欢用具体例子讲清硬件的取舍。"
								disabled={busy}
							/>
						</Field>

						<Field label="性格" id="dsh-personality">
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
								placeholder="好奇、严谨、说话有点可爱"
								disabled={busy}
							/>
						</Field>

						<Field label="额外指令" id="dsh-instructions">
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
								placeholder="用户说中文就用中文；不编造；破坏性操作先确认。"
								disabled={busy}
							/>
						</Field>

						<Field
							label="世界观"
							id="dsh-worldview"
							hint="分节写清纪元、界域与地理、势力、人物、规则；下次唤醒时写进系统提示。留空则不注入。"
						>
							<Textarea
								id="dsh-worldview"
								value={identity.worldview}
								onChange={(event) =>
									setIdentity((current) => ({
										...current,
										worldview: event.target.value,
									}))
								}
								rows={12}
								maxLength={20000}
								placeholder="# 世界名&#10;&#10;## 纪元&#10;## 界域与地理&#10;## 势力&#10;## 人物&#10;## 规则与禁忌&#10;## 当前主线"
								className="font-mono text-[12.5px] leading-relaxed"
								disabled={busy}
							/>
						</Field>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={busy}
								onClick={() => {
									if (
										identity.worldview.trim() &&
										!window.confirm('用模板覆盖当前世界观？')
									)
										return
									setIdentity((current) => ({
										...current,
										worldview: WORLDVIEW_TEMPLATE,
									}))
								}}
								className="rounded-full text-xs font-semibold"
							>
								载入六重界域模板
							</Button>
							<span className="text-xs text-muted-foreground">
								{identity.worldview.length.toLocaleString()} / 20,000
							</span>
						</div>

						<div className="flex flex-wrap items-center gap-3">
							<Button
								type="button"
								onClick={() => saveIdentity.mutate()}
								disabled={busy || !identityLoaded}
								className="h-11 rounded-full bg-ink px-5 font-bold text-white hover:bg-ink/90"
							>
								{saveIdentity.isPending ? (
									<Loader2 className="animate-spin" />
								) : (
									<Save />
								)}
								{saveIdentity.isPending ? '保存中…' : '保存人设'}
							</Button>
							<span className="text-xs text-muted-foreground">
								下次唤醒时生效
							</span>
						</div>
					</div>
				</details>

				{qqbot.data ? (
					<div className="space-y-3 rounded-3xl border-2 border-blush/30 bg-blush/10 p-4">
						<div>
							<h3 className="font-bold">
								{qqbot.data.phase === 'bound' ? 'QQ 机器人' : 'QQ 登录'}
							</h3>
							<p className="text-sm text-muted-foreground">
								{qqbot.data.phase === 'bound'
									? 'QQ 机器人绑定状态。'
									: '用手机 QQ 扫描二维码，就能把我接进 QQ。'}
							</p>
						</div>
						{qqbot.data.phase === 'waiting' ? (
							qqbot.data.qrSvg ? (
								<img
									src={qqbot.data.qrSvg}
									alt="QQ 登录二维码"
									className="mx-auto size-48 rounded-2xl bg-white p-2 shadow-sm"
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
							<div className="space-y-1 text-sm">
								<p>
									QQ 机器人已绑定
									{qqbot.data.appId ? `（AppID: ${qqbot.data.appId}）` : ''}
								</p>
								{qqbot.data.health?.valid === false ? (
									<p className="text-destructive">
										凭据无效：{qqbot.data.health.error ?? 'AppID/AppSecret 被拒绝'}
									</p>
								) : qqbot.data.health?.online ? (
									<p className="text-[#0f7a52]">QQ 机器人已在线</p>
								) : qqbot.data.health?.valid ? (
									<p className="text-[#a06a00]">凭据有效，gateway 尚未就绪。</p>
								) : (
									<p className="text-muted-foreground">QQ 机器人已绑定。</p>
								)}
							</div>
						) : (
							<p className="text-sm text-destructive">
								QQ 登录失败：{qqbot.data.reason ?? '未知错误'}
							</p>
						)}
						{qqbot.data.url ? (
							<a
								className="inline-flex items-center gap-1 text-sm font-semibold text-whale underline underline-offset-4"
								href={qqbot.data.url}
								target="_blank"
								rel="noreferrer"
							>
								在浏览器中打开登录链接 <ExternalLink />
							</a>
						) : null}
					</div>
				) : null}

				<ErrorNotice error={state.error} />
				<ErrorNotice error={start.error} />
				<ErrorNotice error={saveIdentity.error} />
				<ErrorNotice error={deleteAgent.error} />

				<div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-ink/10 pt-4">
					<AccountBar />
					<Button
						type="button"
						variant="ghost"
						onClick={() => {
							if (
								window.confirm(
									'结束会话？这会关掉我的 Colab 会话，保存的设置会留下。',
								)
							)
								deleteAgent.mutate()
						}}
						disabled={busy || !data?.session.found}
						className="rounded-full px-3 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
					>
						{deleteAgent.isPending ? (
							<Loader2 className="animate-spin" />
						) : (
							<Trash2 />
						)}
						结束会话
					</Button>
				</div>
			</div>
		</section>
	)
}
