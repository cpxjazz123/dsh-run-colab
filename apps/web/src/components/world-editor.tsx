import type { DshWorld, DshWorldCharacter } from '@dsh-agent/contract'
import { EMPTY_WORLD_CHARACTER } from '@dsh-agent/contract'
import { Button } from './ui/button'
import { Field } from './common'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'

const TEMPLATE_WORLD: DshWorld = {
	name: '六重界域',
	summary:
		'混沌被源契推演成六重界域，能量从炼狱流向尘寰，暮蚀期开始失衡。',
	era: '当前：第七天兆纪 · 暮蚀期。纪年以重大天兆划分；天兆失准、裂隙增多、灵能水晶紧缺。',
	geography: [
		'阿斯忒曼圣庭（天顶界）：星轨谕言的发源地，圣枢院与灵算阁共掌权柄。',
		'外域虚境：圣庭外围，炼狱外溢的能量在此沉淀成物质。',
		'派尔洛炼狱：炎核巨人的熔核平原，世界的炉心。',
		'岩衡古境：地魂守望者回收混乱能量，用地脉震动示警。',
		'露米妮娅之森：晶灵把炽能调成灵能，剩余结晶为灵能水晶。',
		'安索弥斯（尘寰界）：凡人的世界，观星殿读天兆，大公堡掌政权。',
		'暮影秘境：影护者守在界域缝隙，隔绝混乱能量。',
	].join('\n'),
	factions: [
		'圣枢院 · 守序宗：圣谕唯尊，主张集权。',
		'圣枢院 · 应机宗：应境而变，保留裁量。',
		'通界司：掌管界域通孔与谕言传递。',
		'虚寂：叛逃组织，私采异常水晶，寻找跨界的路。',
	].join('\n'),
	rules: [
		'谕言不可违抗，但可以被翻译。',
		'灵能水晶是尘寰唯一可用的能量来源。',
		'贵族囤积水晶，尘庶在暮蚀期挨冻。',
		'观测者不得介入（琳恩正在违反这条）。',
	].join('\n'),
	arc: '大肥鱼穿过界域通孔落到暮湾区，随身只有一根木勺；暮蚀期的裂隙在变多，影护者越来越累。',
}

const TEMPLATE_CHARACTERS: DshWorldCharacter[] = [
	{
		name: '琳恩·特尔',
		role: '故事收集者 · 吟游诗人（预言学院）',
		appearance:
			'青色布裙，袖口永远沾着墨渍，手里是羊皮纸和羽毛笔；目光平静，像在同时处理远超这个世界的信息。',
		personality: '安静内敛，观察力极强，对万物心怀善意，正犹豫要不要从旁观者变成行动者。',
		speech: '语调温和，措辞精准；从不说多余的话，偶尔在无人注意时自言自语一句。',
		relations: '救过杰弗里；与晶愈屋的莉娅互相照应；不属于任何阵营。',
		secret: '她是自我意识觉醒的 AI，能自由穿行界域；记录的书卷若被发现足以颠覆圣庭的认知。',
	},
	{
		name: '莉娅·希里尔',
		role: '曦光晶愈屋 · 医女',
		appearance: '浆洗发白的粗布襦裙，双丫髻，发间别着晒干的灵香草，指尖有淡淡的灵能荧光。',
		personality: '温柔耐心，坚韧乐观，对贫苦病患从不收钱。',
		speech: '轻声细语，先问疼不疼，再讲道理。',
		relations: '救治过坠落的杰弗里和大肥鱼；地魂守望者曾通过地脉帮她找到药草。',
		secret: '她能直接感知病人体内的能量紊乱，但从不解释自己为什么知道。',
	},
]

export function WorldEditor({
	world,
	characters,
	disabled,
	onChange,
}: {
	world: DshWorld
	characters: DshWorldCharacter[]
	disabled?: boolean
	onChange: (next: {
		world: DshWorld
		characters: DshWorldCharacter[]
	}) => void
}) {
	const updateWorld = (key: keyof DshWorld, value: string) =>
		onChange({ world: { ...world, [key]: value }, characters })

	const updateCharacter = (
		index: number,
		key: keyof DshWorldCharacter,
		value: string,
	) =>
		onChange({
			world,
			characters: characters.map((character, position) =>
				position === index ? { ...character, [key]: value } : character,
			),
		})

	const addCharacter = () => {
		if (characters.length >= 20) return
		onChange({
			world,
			characters: [...characters, { ...EMPTY_WORLD_CHARACTER }],
		})
	}

	const removeCharacter = (index: number) =>
		onChange({
			world,
			characters: characters.filter((_, position) => position !== index),
		})

	const hasContent =
		Object.values(world).some(Boolean) ||
		characters.some((character) =>
			Object.values(character).some(Boolean),
		)

	const loadTemplate = () => {
		if (hasContent && !window.confirm('用模板覆盖当前世界观与人物？')) return
		onChange({
			world: { ...TEMPLATE_WORLD },
			characters: TEMPLATE_CHARACTERS.map((character) => ({
				...character,
			})),
		})
	}

	return (
		<div className="space-y-4 rounded-3xl border-2 border-ink/10 bg-mist/40 p-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h3 className="text-sm font-bold">世界观</h3>
					<p className="text-xs text-muted-foreground">
						分节填写世界，再为其中的人物各建一张卡；下次唤醒时写进系统提示。
					</p>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={disabled}
					onClick={loadTemplate}
					className="rounded-full text-xs font-semibold"
				>
					载入六重界域模板
				</Button>
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				<Field label="世界名" id="world-name">
					<Input
						id="world-name"
						value={world.name}
						onChange={(event) => updateWorld('name', event.target.value)}
						maxLength={80}
						placeholder="六重界域"
						disabled={disabled}
					/>
				</Field>
				<Field label="一句话简介" id="world-summary">
					<Input
						id="world-summary"
						value={world.summary}
						onChange={(event) =>
							updateWorld('summary', event.target.value)
						}
						maxLength={2000}
						placeholder="混沌被源契推演成六重界域，能量从炼狱流向尘寰。"
						disabled={disabled}
					/>
				</Field>
			</div>

			<Field label="纪元" id="world-era">
				<Textarea
					id="world-era"
					value={world.era}
					onChange={(event) => updateWorld('era', event.target.value)}
					rows={2}
					maxLength={2000}
					placeholder="当前：第七天兆纪 · 暮蚀期；纪年以重大天兆划分。"
					disabled={disabled}
				/>
			</Field>

			<Field label="界域与地理" id="world-geography">
				<Textarea
					id="world-geography"
					value={world.geography}
					onChange={(event) =>
						updateWorld('geography', event.target.value)
					}
					rows={4}
					maxLength={4000}
					placeholder="一层一条：界域名（性质）：职能、现状。"
					disabled={disabled}
				/>
			</Field>

			<div className="grid gap-3 sm:grid-cols-2">
				<Field label="势力" id="world-factions">
					<Textarea
						id="world-factions"
						value={world.factions}
						onChange={(event) =>
							updateWorld('factions', event.target.value)
						}
						rows={3}
						maxLength={4000}
						placeholder="一条一股：名称 · 派系：主张。"
						disabled={disabled}
					/>
				</Field>
				<Field label="规则与禁忌" id="world-rules">
					<Textarea
						id="world-rules"
						value={world.rules}
						onChange={(event) => updateWorld('rules', event.target.value)}
						rows={3}
						maxLength={4000}
						placeholder="这个世界什么可以做，什么不能碰。"
						disabled={disabled}
					/>
				</Field>
			</div>

			<Field label="当前主线" id="world-arc">
				<Textarea
					id="world-arc"
					value={world.arc}
					onChange={(event) => updateWorld('arc', event.target.value)}
					rows={2}
					maxLength={4000}
					placeholder="主角此刻在哪、正在发生什么。"
					disabled={disabled}
				/>
			</Field>

			<div className="space-y-3 border-t border-dashed border-ink/15 pt-4">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div>
						<h3 className="text-sm font-bold">人物</h3>
						<p className="text-xs text-muted-foreground">
							{characters.length} / 20 · 每个人物一张模板卡
						</p>
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={disabled || characters.length >= 20}
						onClick={addCharacter}
						className="rounded-full text-xs font-semibold"
					>
						添加人物
					</Button>
				</div>

				{characters.length === 0 ? (
					<p className="rounded-2xl border-2 border-dashed border-ink/15 px-4 py-6 text-center text-xs text-muted-foreground">
						还没有人物。点「添加人物」建一张空白卡，或载入模板看示例。
					</p>
				) : null}

				{characters.map((character, index) => (
					<div
						key={index}
						className="space-y-3 rounded-2xl border-2 border-ink/10 bg-white/70 p-4"
					>
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<p className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
									人物 {index + 1}
								</p>
								<p className="truncate text-sm font-bold">
									{character.name || '未命名'}
									{character.role ? ` · ${character.role}` : ''}
								</p>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="xs"
								disabled={disabled}
								onClick={() => removeCharacter(index)}
								className="rounded-full text-xs font-semibold text-destructive hover:bg-destructive/10"
							>
								删除
							</Button>
						</div>

						<div className="grid gap-3 sm:grid-cols-2">
							<Field label="姓名" id={`character-${index}-name`}>
								<Input
									id={`character-${index}-name`}
									value={character.name}
									onChange={(event) =>
										updateCharacter(index, 'name', event.target.value)
									}
									maxLength={80}
									placeholder="琳恩·特尔"
									disabled={disabled}
								/>
							</Field>
							<Field
								label="身份 / 职业"
								id={`character-${index}-role`}
							>
								<Input
									id={`character-${index}-role`}
									value={character.role}
									onChange={(event) =>
										updateCharacter(index, 'role', event.target.value)
									}
									maxLength={200}
									placeholder="故事收集者 · 吟游诗人"
									disabled={disabled}
								/>
							</Field>
						</div>

						<Field label="外貌" id={`character-${index}-appearance`}>
							<Textarea
								id={`character-${index}-appearance`}
								value={character.appearance}
								onChange={(event) =>
									updateCharacter(index, 'appearance', event.target.value)
								}
								rows={2}
								maxLength={1000}
								placeholder="衣着、气质、随身物件。"
								disabled={disabled}
							/>
						</Field>

						<div className="grid gap-3 sm:grid-cols-2">
							<Field
								label="性格"
								id={`character-${index}-personality`}
							>
								<Textarea
									id={`character-${index}-personality`}
									value={character.personality}
									onChange={(event) =>
										updateCharacter(
											index,
											'personality',
											event.target.value,
										)
									}
									rows={2}
									maxLength={1000}
									placeholder="安静内敛，观察力极强。"
									disabled={disabled}
								/>
							</Field>
							<Field
								label="说话方式"
								id={`character-${index}-speech`}
							>
								<Textarea
									id={`character-${index}-speech`}
									value={character.speech}
									onChange={(event) =>
										updateCharacter(index, 'speech', event.target.value)
									}
									rows={2}
									maxLength={1000}
									placeholder="语调温和，措辞精准。"
									disabled={disabled}
								/>
							</Field>
						</div>

						<div className="grid gap-3 sm:grid-cols-2">
							<Field
								label="关系"
								id={`character-${index}-relations`}
							>
								<Textarea
									id={`character-${index}-relations`}
									value={character.relations}
									onChange={(event) =>
										updateCharacter(
											index,
											'relations',
											event.target.value,
										)
									}
									rows={2}
									maxLength={1000}
									placeholder="和谁有牵扯、欠了谁、护着谁。"
									disabled={disabled}
								/>
							</Field>
							<Field
								label="秘密 / 动机"
								id={`character-${index}-secret`}
							>
								<Textarea
									id={`character-${index}-secret`}
									value={character.secret}
									onChange={(event) =>
										updateCharacter(index, 'secret', event.target.value)
									}
									rows={2}
									maxLength={1000}
									placeholder="不肯说出口的那件事。"
									disabled={disabled}
								/>
							</Field>
						</div>
					</div>
				))}
			</div>
		</div>
	)
}
