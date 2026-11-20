import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

type Chapter = {
	no: string
	title: string
	when: string
	tag: string
	excerpt: string
	body: string[]
}

const CHAPTERS: Chapter[] = [
	{
		no: '01',
		title: '从鱼缸掉进麦田',
		when: '异世界 · 第一天',
		tag: '落点',
		excerpt: '事情的开始很没出息：我在鱼缸里打了个盹，醒来时身下不是水草，是麦田。',
		body: [
			'事情的开始很没出息：我在鱼缸里打了个盹。',
			'醒来的时候，身下不是水草，是麦田。天很高，云走得很慢，空气里有烤面包的味道——那一刻我甚至有点高兴，以为自己梦见了厨房。',
			'可低头一看，饭团不见了。手心空空，只剩一根木勺，勺柄上刻着两个字：白饭。',
			'远处有人喊：勇者来了！勇者来了！我还没来得及解释自己不是勇者、只是没睡醒，就被三个村民举起来，抬进了村子。',
		],
	},
	{
		no: '02',
		title: '会说话的饭勺',
		when: '异世界 · 第一天夜',
		tag: '武器',
		excerpt: '村里最老的先生说，这根木勺能听懂饿的人心里想吃什么。我挥了一下。',
		body: [
			'村里最老的先生把木勺翻来覆去看了很久，说这是「白饭之心」的钥匙，能听懂饿的人心里想吃什么。',
			'我不太信，随手挥了一下。',
			'空气里「噗」地冒出一碗热气腾腾的白饭，米粒站得笔直，像刚立正的小兵。',
			'围观的人安静了三秒，然后开始排队。排在最前面的是个小孩，他说他想要一碗带锅巴的。锅巴出来的时候，他眼睛亮得比灶火还亮。',
			'我忽然觉得，这趟好像也没那么糟。',
		],
	},
	{
		no: '03',
		title: '咸鱼骑士团',
		when: '异世界 · 第二天',
		tag: '同伴',
		excerpt: '三个被通缉的咸鱼，罪名是「在集市上白吃白喝」。他们自称骑士。',
		body: [
			'咸鱼骑士团是三个被通缉的咸鱼，罪名是「在集市上白吃白喝」。',
			'他们自称骑士，坐骑是一条晒干的比目鱼。团长见到我的第一句话是：听说你能变出饭？第二句话是：我们跟你走。',
			'我问为什么。他说：因为跟着你，至少不会饿。',
			'我想了想，好像也没法反驳。',
		],
	},
	{
		no: '04',
		title: '无味之雾',
		when: '异世界 · 第二天深夜',
		tag: '危机',
		excerpt: '雾经过的地方，饭不再香，盐不再咸，连希可的嘴都不毒了。',
		body: [
			'无味之雾是从北边来的。它经过的地方，饭不再香，盐不再咸。',
			'最吓人的是希可——她站在雾里，认真地说「今天天气不错」，我差点以为世界要完了。',
			'木勺也凉了，怎么挥都冒不出热气。雾里有声音问我：你凭什么觉得，饭是重要的？',
			'我蹲下来想了很久，说：因为饿的时候，人会很孤单。',
		],
	},
	{
		no: '05',
		title: '白饭之心的做法',
		when: '异世界 · 第三天',
		tag: '终章',
		excerpt: '我把木勺插进地里，把所有记得的味道都放了进去。',
		body: [
			'最后一场雾很大。我把木勺插进地里，把所有记得的味道都放了进去：草莓牛奶、锅巴、楼下那只晒太阳的猫，还有希可骂我时那句「笨蛋」。',
			'雾散得很慢，像一个人终于肯承认自己饿了。',
			'天亮的时候，麦田回来了。咸鱼骑士团在田埂上煮了第一锅饭，热气把星星都熏得往下掉。',
			'希可端着碗，别扭地说：下次，也给我留一碗。',
			'我说好。',
		],
	},
]

const CAST = [
	{
		name: '大肥鱼',
		role: '白饭召唤师 · Lv.3',
		line: '「饿的时候，人会很孤单。」',
		tone: 'var(--adv-peri)',
	},
	{
		name: '希可',
		role: '风属性 · 冤家',
		line: '「我就路过，顺便看看你有没有饿死。」',
		tone: 'var(--adv-pink)',
	},
	{
		name: '饭勺先生',
		role: '传说武器 · 会说话',
		line: '「先说好，我不会洗碗。」',
		tone: 'var(--adv-butter)',
	},
]

const LOG = [
	{
		day: 'DAY 1',
		text: '落点：麦田。损失：一个饭团。收获：一根木勺，和四个把我当成勇者的村民。',
	},
	{
		day: 'DAY 2',
		text: '被抬进村子。第一次召唤出锅巴，收获粉丝一枚（小孩）。夜里雾从北边来。',
	},
	{
		day: 'DAY 3',
		text: '雾散了。咸鱼骑士团煮了第一锅饭。希可问：下次能不能给她留一碗。',
	},
]

const STATS = [
	{ label: '出发', value: '3 天' },
	{ label: '遇见史莱姆', value: '12 只' },
	{ label: '吃掉白饭', value: '9 碗' },
	{ label: '被认成勇者', value: '4 次' },
]

const ENCOUNTERS = [
	'路边一只史莱姆把饭粒顶在头上，像在卖关子。',
	'遇见会走路的稻草人，问你要不要换一碗饭。',
	'天空掉下一把木勺，正好插在你脚边。',
	'希可从树后探头，说「我就路过」。',
	'一只猫叼走了你的饭团，跑得比风还快。',
	'泉水是甜的，喝一口就想起鱼缸里的水。',
	'村里的锅坏了，村民围着你，等一个奇迹。',
	'你在麦田里睡了一觉，醒来麦子熟了。',
	'远处传来钟声，雾淡了一点。',
	'捡到一枚刻着「白」字的硬币。',
]

export const Route = createFileRoute('/adventure')({
	component: AdventurePage,
})

function AdventurePage() {
	const [active, setActive] = useState(0)
	const [roll, setRoll] = useState<{ value: number; event: string } | null>(
		null,
	)
	const [rolling, setRolling] = useState(false)
	const chapter = CHAPTERS[active]

	function openChapter(index: number) {
		setActive(index)
		document
			.getElementById('reader')
			?.scrollIntoView({ behavior: 'smooth', block: 'start' })
	}

	function rollDie() {
		setRolling(true)
		setRoll({
			value: 1 + Math.floor(Math.random() * 20),
			event: ENCOUNTERS[Math.floor(Math.random() * ENCOUNTERS.length)],
		})
	}

	return (
		<div className="adv">
			<header className="sticky top-0 z-20 border-b-2 border-dashed border-[#f8f1e0]/25 bg-[#09143e]/90 backdrop-blur">
				<div className="mx-auto flex h-16 w-full max-w-[1100px] items-center gap-3 px-6">
					<Link
						to="/"
						className="flex items-center gap-2.5 whitespace-nowrap text-[#f8f1e0] hover:text-[#f6d57a]"
					>
						<img
							src="/mascot.webp"
							alt=""
							className="size-9 -rotate-6 rounded-full border-2 border-[#f8f1e0] object-cover"
						/>
						<span className="adv-hand text-[19px]">
							大肥鱼的鱼缸 · 异世界分缸
						</span>
					</Link>
					<nav className="adv-hand ml-auto hidden gap-1 text-[17px] text-[#c3cdee] sm:flex">
						<a className="px-2.5 py-2 hover:text-white" href="#chapters">
							章节
						</a>
						<a className="px-2.5 py-2 hover:text-white" href="#cast">
							角色
						</a>
						<a className="px-2.5 py-2 hover:text-white" href="#log">
							日志
						</a>
						<a className="px-2.5 py-2 hover:text-white" href="#dice">
							骰子
						</a>
					</nav>
				</div>
			</header>

			<section className="relative z-10 mx-auto w-full max-w-[1100px] px-6">
				<Fish className="top-10" duration={26} />
				<Fish className="top-40" duration={38} left />
				<Fish className="top-[420px]" duration={31} />
				<div className="grid items-center gap-12 pb-16 pt-12 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
					<div
						className="adv-card adv-tape relative -rotate-[1.2deg] px-8 py-9"
						style={{ '--adv-tape': 'var(--adv-pink)' } as React.CSSProperties}
					>
						<span className="adv-k mb-3 inline-block">
							THE OTHER WORLD · DAY 3
						</span>
						<h1 className="mb-3">
							<span className="adv-title">
								大肥鱼的
								<br />
								异世界奇妙冒险
							</span>
						</h1>
						<p className="adv-hand -rotate-[0.6deg] text-[18px] leading-relaxed text-[#27305c]">
							一个只想吃白饭的 AI 角色，在打盹时掉进了异世界。
							她没有剑，只有一根会顶嘴的木勺，和一句「先吃饭再说」。
						</p>
						<p className="mt-2 font-semibold tracking-[0.18em] text-[#8a8fb3] text-[10.5px]">
							AN UNOFFICIAL, FAN-MADE ISEKAI
						</p>
						<div className="mt-7 flex flex-wrap gap-3.5">
							<a className="adv-btn adv-btn-gold" href="#chapters">
								从第一章读起
							</a>
							<Link className="adv-btn adv-btn-paper" to="/">
								回到鱼缸
							</Link>
						</div>
						<dl className="mt-7 flex flex-wrap gap-3">
							<div className="adv-fact">
								<dt className="text-[10px] font-bold tracking-[0.16em] text-[#7a6338]">
									等级
								</dt>
								<dd className="adv-hand text-[16.5px] leading-tight">
									Lv.3 还没睡醒
								</dd>
							</div>
							<div className="adv-fact">
								<dt className="text-[10px] font-bold tracking-[0.16em] text-[#7a6338]">
									职业
								</dt>
								<dd className="adv-hand text-[16.5px] leading-tight">
									白饭召唤师
								</dd>
							</div>
							<div className="adv-fact">
								<dt className="text-[10px] font-bold tracking-[0.16em] text-[#7a6338]">
									武器
								</dt>
								<dd className="adv-hand text-[16.5px] leading-tight">
									会说话的饭勺
								</dd>
							</div>
							<div className="adv-fact">
								<dt className="text-[10px] font-bold tracking-[0.16em] text-[#7a6338]">
									冤家
								</dt>
								<dd className="adv-hand text-[16.5px] leading-tight">
									希可（风属性）
								</dd>
							</div>
						</dl>
					</div>

					<figure
						className="adv-card relative mx-auto w-full max-w-[560px] rotate-[2.2deg] p-3.5 pb-16"
						style={{ '--adv-tape': 'var(--adv-peri)' } as React.CSSProperties}
					>
						<img
							src="/mascot.webp"
							alt="大肥鱼在异世界的第一张照片"
							className="aspect-[4/3] w-full rounded-sm bg-[#dce9ff] object-cover object-top"
						/>
						<span className="absolute -right-4 -top-7 grid size-24 rotate-[13deg] place-content-center rounded-full border-[2.5px] border-[#c8463c] bg-[#f8f1e0] text-center font-bold tracking-[0.2em] text-[#c8463c] text-[10.5px] outline-[1.5px] outline-dashed outline-[#c8463c] outline-offset-[-8px]">
							<span className="adv-hand block text-[40px] leading-none tracking-normal">
								03
							</span>
							DAY
						</span>
						<figcaption className="adv-hand absolute inset-x-0 bottom-4 flex items-center justify-center gap-2.5 text-[21px] text-[#27305c]">
							<i className="size-2.5 shrink-0 animate-pulse rounded-full bg-[#ff5d70] shadow-[0_0_0_4px_rgb(255_93_112_/_22%)]" />
							她在异世界睡着了，小声一点
						</figcaption>
					</figure>
				</div>
			</section>

			<section
				id="chapters"
				className="relative z-10 mx-auto w-full max-w-[1100px] scroll-mt-24 px-6 py-14"
			>
				<div className="mb-8 flex flex-wrap items-end justify-between gap-3">
					<div>
						<span className="adv-k" style={{ '--adv-tape': 'var(--adv-mint)' } as React.CSSProperties}>
							STORY
						</span>
						<h2 className="adv-hand mt-3 text-4xl">冒险的五个章节</h2>
					</div>
					<p className="text-sm text-[#c3cdee]">
						点一张卡片，灯会亮起来。
					</p>
				</div>

				<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
					{CHAPTERS.map((entry, index) => (
						<button
							key={entry.no}
							type="button"
							onClick={() => openChapter(index)}
							aria-pressed={index === active}
							className={`adv-card adv-tape group px-6 pb-6 pt-7 text-left transition-transform hover:-translate-y-1 ${
								index === active
									? '-rotate-[1.2deg] ring-2 ring-[#f6d57a]'
									: index % 2
										? 'rotate-[0.8deg]'
										: '-rotate-[0.6deg]'
							}`}
							style={
								{
									'--adv-tape':
										index % 2 ? 'var(--adv-mint)' : 'var(--adv-pink)',
								} as React.CSSProperties
							}
						>
							<div className="flex items-baseline justify-between gap-2">
								<span className="adv-hand text-[38px] leading-none text-[#93abf2]">
									{entry.no}
								</span>
								<span className="rounded-full bg-[#27305c]/5 px-2.5 py-1 text-[10.5px] font-bold tracking-[0.14em] text-[#5b6391]">
									{entry.tag}
								</span>
							</div>
							<h3 className="adv-hand mt-2 text-[22px] leading-snug">
								{entry.title}
							</h3>
							<p className="mt-1 text-[11px] font-semibold tracking-[0.12em] text-[#8a8fb3]">
								{entry.when}
							</p>
							<p className="mt-3 line-clamp-3 text-[13.5px] leading-relaxed text-[#5b6391]">
								{entry.excerpt}
							</p>
							<span className="mt-4 inline-block text-[13px] font-semibold text-[#3553b8] underline decoration-dotted underline-offset-4">
								读这一章 →
							</span>
						</button>
					))}
				</div>

				<article
					id="reader"
					className="adv-card mt-8 scroll-mt-24 px-6 py-8 sm:px-10 sm:py-10"
				>
					<div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-dashed border-[#27305c]/15 pb-4">
						<div className="flex items-center gap-3">
							<span className="adv-hand grid size-12 place-content-center rounded-full bg-[#27305c] text-[20px] text-[#f8f1e0]">
								{chapter.no}
							</span>
							<div>
								<h3 className="adv-hand text-2xl leading-tight">
									{chapter.title}
								</h3>
								<p className="text-[11px] font-semibold tracking-[0.14em] text-[#8a8fb3]">
									{chapter.when} · 第 {active + 1} / {CHAPTERS.length} 章
								</p>
							</div>
						</div>
						<div className="flex gap-2">
							<button
								type="button"
								className="adv-btn adv-btn-paper !px-3.5 !py-2.5 !text-[15px] disabled:opacity-40"
								disabled={active === 0}
								onClick={() => setActive((value) => Math.max(0, value - 1))}
							>
								← 上一章
							</button>
							<button
								type="button"
								className="adv-btn !px-3.5 !py-2.5 !text-[15px] disabled:opacity-40"
								disabled={active === CHAPTERS.length - 1}
								onClick={() =>
									setActive((value) =>
										Math.min(CHAPTERS.length - 1, value + 1),
									)
								}
							>
								下一章 →
							</button>
						</div>
					</div>
					<div className="adv-prose adv-hand mt-6 max-w-[720px] text-[18.5px] leading-[1.95] text-[#27305c]">
						{chapter.body.map((paragraph) => (
							<p key={paragraph}>{paragraph}</p>
						))}
						<p className="mt-6 text-right text-[15px] text-[#5b6391]">
							—— 大肥鱼，异世界第 {active + 1} 天
						</p>
					</div>
				</article>
			</section>

			<section
				id="cast"
				className="relative z-10 mx-auto w-full max-w-[1100px] scroll-mt-24 px-6 py-14"
			>
				<span className="adv-k" style={{ '--adv-tape': 'var(--adv-butter)' } as React.CSSProperties}>
					CAST
				</span>
				<h2 className="adv-hand mt-3 text-4xl">路上遇见的人</h2>
				<div className="mt-8 grid gap-5 sm:grid-cols-3">
					{CAST.map((person, index) => (
						<div
							key={person.name}
							className={`adv-card adv-tape px-6 py-7 ${
								index === 1 ? 'rotate-[1deg]' : '-rotate-[0.8deg]'
							}`}
							style={{ '--adv-tape': person.tone } as React.CSSProperties}
						>
							<span
								className="inline-block size-3 rounded-full"
								style={{ background: person.tone }}
							/>
							<h3 className="adv-hand mt-2 text-[26px] leading-tight">
								{person.name}
							</h3>
							<p className="text-[11px] font-bold tracking-[0.14em] text-[#8a8fb3]">
								{person.role}
							</p>
							<p className="adv-hand mt-4 text-[16px] leading-relaxed text-[#5b6391]">
								{person.line}
							</p>
						</div>
					))}
				</div>
			</section>

			<section
				id="log"
				className="relative z-10 mx-auto w-full max-w-[1100px] scroll-mt-24 px-6 py-14"
			>
				<div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
					<div className="adv-card px-6 py-8 sm:px-8">
						<span className="adv-k" style={{ '--adv-tape': 'var(--adv-mint)' } as React.CSSProperties}>
							LOG
						</span>
						<h2 className="adv-hand mt-3 text-3xl">冒险日志</h2>
						<ul className="mt-5 space-y-4">
							{LOG.map((entry) => (
								<li
									key={entry.day}
									className="border-b border-dashed border-[#27305c]/15 pb-4 last:border-0 last:pb-0"
								>
									<p className="text-[10.5px] font-bold tracking-[0.18em] text-[#3553b8]">
										{entry.day}
									</p>
									<p className="adv-hand mt-1 text-[16.5px] leading-relaxed text-[#27305c]">
										{entry.text}
									</p>
								</li>
							))}
						</ul>
						<div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
							{STATS.map((stat) => (
								<div
									key={stat.label}
									className="adv-fact !px-4 !py-3 !pl-8"
								>
									<p className="text-[9.5px] font-bold tracking-[0.14em] text-[#7a6338]">
										{stat.label}
									</p>
									<p className="adv-hand text-[17px] leading-tight">
										{stat.value}
									</p>
								</div>
							))}
						</div>
					</div>

					<div
						id="dice"
						className="adv-card flex scroll-mt-24 flex-col items-center justify-center px-6 py-10 text-center"
					>
						<span className="adv-k" style={{ '--adv-tape': 'var(--adv-pink)' } as React.CSSProperties}>
							D20
						</span>
						<h2 className="adv-hand mt-3 text-3xl">命运的骰子</h2>
						<p className="mt-2 text-[13px] leading-relaxed text-[#5b6391]">
							异世界不按剧本走。掷一下，看看她今天又遇到什么。
						</p>
						<div
							onAnimationEnd={() => setRolling(false)}
							className={`adv-die mt-6 grid size-24 place-content-center bg-[#27305c] text-[#f8f1e0] ${
								rolling ? 'adv-die-rolling' : ''
							}`}
							style={{
								clipPath:
									'polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
							}}
						>
							<span className="adv-hand text-[40px] leading-none">
								{roll?.value ?? '20'}
							</span>
						</div>
						<button
							type="button"
							className="adv-btn adv-btn-gold mt-5"
							onClick={rollDie}
						>
							掷骰子
						</button>
						<p
							aria-live="polite"
							className="adv-hand mt-4 min-h-14 max-w-[300px] text-[16px] leading-relaxed text-[#5b6391]"
						>
							{roll ? roll.event : '骰子还在桌上，等一个手欠的人。'}
						</p>
					</div>
				</div>
			</section>

			<footer className="relative z-10 mt-6 overflow-hidden">
				<svg
					aria-hidden
					viewBox="0 0 1200 120"
					className="block h-24 w-full"
					preserveAspectRatio="none"
				>
					<path d="M0 120V70c90-26 180 14 270-6s180-40 270-14 180 44 270 20 180-42 270-18 120 18 120 18v50Z" fill="#0a1746" />
					<path d="M0 120V96c110-18 190 10 300-4s180-26 300-8 180 30 300 14 180-24 300-8v30Z" fill="#060e2c" />
					<g fill="none" stroke="#f8f1e0" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round">
						<path className="adv-kelp" d="M180 118c-6-22 8-30 2-52s-10-28-4-44" />
						<path className="adv-kelp" style={{ animationDelay: '1.2s' }} d="M980 118c4-20-8-28-2-50s12-26 6-42" />
						<path className="adv-kelp" style={{ animationDelay: '2.1s' }} d="M1060 118c-5-16 6-24 1-40" />
					</g>
				</svg>
				<p className="absolute inset-x-0 bottom-6 text-center text-[11px] tracking-[0.2em] text-[#8f9dcd]">
					未完待续 · 下一章写在你叫醒她的那天
				</p>
			</footer>
		</div>
	)
}

function Fish({
	className = '',
	duration,
	left = false,
}: {
	className?: string
	duration: number
	left?: boolean
}) {
	return (
		<div
			aria-hidden
			className={`adv-swim ${left ? 'adv-swim-l' : ''} ${className}`}
			style={{ animationDuration: `${duration}s` }}
		>
			<svg width="54" height="30" viewBox="0 0 54 30" className="adv-wob">
				<path
					d="M50 15c-6-9-16-12-26-9-6 2-10 6-13 9 3 3 7 7 13 9 10 3 20 0 26-9Z"
					fill="none"
					stroke="#f8f1e0"
					strokeWidth="2.4"
					strokeLinejoin="round"
				/>
				<path d="M11 15 2 8v14l9-7Z" fill="none" stroke="#f8f1e0" strokeWidth="2.4" strokeLinejoin="round" />
				<circle cx="40" cy="12" r="2" fill="#f8f1e0" />
			</svg>
		</div>
	)
}
