import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

type Chapter = {
	no: string
	title: string
	place: string
	tag: string
	excerpt: string
	body: string[]
}

const REALMS = [
	{
		name: '阿斯忒曼圣庭',
		en: 'Astraman',
		role: '天顶界',
		line: '星轨谕言从这里落下。圣枢院、灵算阁、蕴真殿、通界司分掌神权、推演、源能与通界。',
		accent: 'var(--is-gold)',
	},
	{
		name: '外域虚境',
		en: 'Ethereal Outer',
		role: '圣庭外围',
		line: '炼狱外溢的纯净能量在此沉淀成物质，通界司的船队从这里出海探索。',
		accent: 'var(--is-violet)',
	},
	{
		name: '派尔洛炼狱',
		en: 'Pyro',
		role: '炉心',
		line: '炎核巨人的熔核平原，世界运转的核心能量从这一层烧出来。',
		accent: 'var(--is-seal)',
	},
	{
		name: '岩衡古境',
		en: 'Ancient Realm',
		role: '基准秩序',
		line: '地魂守望者回收各层异变的混乱能量，用地脉震动向尘寰示警。',
		accent: 'var(--is-faint)',
	},
	{
		name: '露米妮娅之森',
		en: 'Luminia',
		role: '能量调和',
		line: '晶灵把纯净炽能调成柔润灵能，再提纯出星枢源能，剩下的结晶就是灵能水晶。',
		accent: 'var(--is-cyan)',
	},
	{
		name: '安索弥斯',
		en: 'Anthromith',
		role: '尘寰界 · 当前落点',
		line: '凡人的世界。观星殿读天兆，大公堡掌政权，灵械阁造器具，尘庶靠灵能水晶过冬。',
		accent: 'var(--is-cyan)',
	},
	{
		name: '暮影秘境',
		en: 'Shadow Field',
		role: '边界',
		line: '影护者守在界域之间的缝隙里，隔绝混乱能量。暮蚀期以来，它们越来越累。',
		accent: 'var(--is-violet)',
	},
]

const CHAPTERS: Chapter[] = [
	{
		no: '01',
		title: '坠星落在暮湾区',
		place: '安索城 · 曦光晶愈屋',
		tag: '坠星',
		excerpt:
			'醒来闻到的不是水草味，是草药味。一个扎双丫髻的姑娘把温热的药推到我面前。',
		body: [
			'坠落的时候我还在打盹。',
			'醒来闻到的不是水草味，是草药味。木头屋顶，水晶吊灯，窗外的光有点发蓝。一个扎双丫髻的姑娘正把一碗温热的药推到我面前，说她叫莉娅。旁边穿青衣的女子合上本子，写下：坠星，落点暮湾区，活着。',
			'我摸了摸口袋，只剩一根木勺。肚子叫了一声，比自我介绍还响。',
			'莉娅笑起来，说晶愈屋只有药，没有饭。我想了想，把木勺举起来。于是那天的暮湾区，第一次飘出了白饭的香气。',
		],
	},
	{
		no: '02',
		title: '观星殿的错音',
		place: '安索城 · 星辉区 · 观星殿',
		tag: '天兆',
		excerpt:
			'星黛拉侧着耳朵听了很久，说星声里有一个错音，像有人把一句话念到一半改了口。',
		body: [
			'星辉区的观星殿建在灵能矿脉正上方，台阶很高，高到我爬一半就想坐下。',
			'殿里有个叫星黛拉的姑娘，侧着耳朵听了很久，说她听见星声里有一个错音。像有人把一句话念到一半，改了口。',
			'我也听见了。那种声音在我原来的世界叫推演偏差，在这里叫暮蚀。',
			'观星殿的祭司让我们别乱说。出门的时候，星黛拉小声问我：你也是从天顶界掉下来的吗？我说不是，我是从鱼缸里掉下来的。她居然认真地点了点头。',
		],
	},
	{
		no: '03',
		title: '石洼落的地脉',
		place: '安索城郊 · 石洼落',
		tag: '地脉',
		excerpt:
			'芬恩蹲在地上，手掌贴着土，说影护者又在打架，而且越来越累。',
		body: [
			'石洼落的人说话不绕弯。芬恩第一眼看见我，就问：城里人，你来干嘛？',
			'我说蹭饭。她把匕首往腰上一别，说：那你会劈柴吗？',
			'那天下午地脉震了三次。芬恩蹲在地上，手掌贴着土，说影护者又在打架，而且越来越累。她的声音忽然低下去：那个东西……不是坏了，是累了。',
			'晚上我用灶台煮了一锅饭。村长吃了三碗，说第四纪裂隙纪之后，就没这么饱过。芬恩没说话，只是把锅底最后一块锅巴留给了我。',
		],
	},
	{
		no: '04',
		title: '森林只是投影',
		place: '安索城外 · 露米妮娅之森（投影）',
		tag: '晶灵',
		excerpt:
			'琳恩说，我们看到的是投影，真正的森林在界域更深处。她说完顿了一下，像后悔说多了。',
		body: [
			'露米妮娅之森是绿色的，绿得不像真的。',
			'琳恩说，因为它的确不是真的。我们看到的是投影，真正的森林在界域更深处，晶灵在里面把炽能调成柔润的灵能。她说完顿了一下，像是后悔说多了。',
			'林子里有拳头大的水晶生灵，飞过时会共振出很轻的和声。我伸手接住一颗，它在我掌心里嗡了一声，像是在说：你怎么这么烫。',
			'我这才想起来，身上还留着曦光晶愈屋的余温。暮蚀期的投影变薄了，连风都带着一点毛边。',
		],
	},
	{
		no: '05',
		title: '源契推演 · 暮蚀',
		place: '安索城 · 界域通孔',
		tag: '抉择',
		excerpt:
			'金色的字从通孔里落下来：凡尘之序，当复其位。翻译过来，大概是把不安分的东西清掉。',
		body: [
			'通界司的星轨谕言是在第五天到的。金色的字从界域通孔里落下来，一条一条，冷得像铁：凡尘之序，当复其位。',
			'翻译过来，大概是把不安分的东西清掉，让世界回到原来的轨道。',
			'琳恩看着那条谕言，笔停了很久。她说：如果只是记录，我本来可以什么都不做。',
			'我说：那就先吃饭吧。饿着肚子做的决定，一般都不太好吃。',
			'我在通孔底下支起锅，把灵能水晶垫在灶底当火。米香飘上去的时候，那些金字忽然暗了一下，像被什么打断。后来谕言改了一条：凡尘之味，亦为变量。',
			'琳恩笑了。她说：你也是从外面来的吧。我说：嗯，我那边管这个叫打盹。',
		],
	},
]

const CAST = [
	{
		name: '琳恩·特尔',
		en: 'Lynn Tale',
		role: '故事收集者 · 吟游诗人（预言学院）',
		line: '「每个普通人的故事，都值得被记录。」',
		note: '她记录一切，也犹豫要不要介入。',
	},
	{
		name: '莉娅·希里尔',
		en: 'Leah HealLight',
		role: '曦光晶愈屋 · 医女',
		line: '「先喝药，再说话。」',
		note: '灵能水晶在指尖发着淡淡的光。',
	},
	{
		name: '星黛拉·奥罗莉亚',
		en: 'Stella Aurolia',
		role: '观星殿 · 天语者候选',
		line: '「星星今天有点跑调。」',
		note: '额间的星形印记会随天兆发烫。',
	},
	{
		name: '芬恩·赫拉利亚',
		en: 'Finn Heralia',
		role: '石洼落 · 游侠',
		line: '「那个东西不是坏了，是累了。」',
		note: '她能听见大地说话，也能看见影护者。',
	},
]

const JOURNAL = [
	{
		day: 'DAY 1',
		text: '坠星，落点暮湾区。丢了饭团，剩一根木勺。被莉娅捡回晶愈屋，药很苦，饭很香。',
	},
	{
		day: 'DAY 2',
		text: '观星殿听见错音。星黛拉说那叫暮蚀，祭司让我们别乱说。',
	},
	{
		day: 'DAY 3',
		text: '石洼落地脉震了三次。煮了一锅饭，换到一块锅巴。',
	},
	{
		day: 'DAY 4',
		text: '森林是投影。晶灵飞过来碰我的指尖，说我太烫。',
	},
	{
		day: 'DAY 5',
		text: '通孔落谕言。锅一开，谕言改了一条：「凡尘之味，亦为变量。」',
	},
]

const PACK = [
	'一根木勺（会顶嘴）',
	'灵能水晶 ×3',
	'灵香草一小瓶',
	'半张星图',
	'锅巴一块（舍不得吃）',
]

const STATS = [
	{ label: '已踏界域', value: '1 / 6' },
	{ label: '灵能水晶', value: '3 枚' },
	{ label: '结识的人', value: '4 位' },
	{ label: '被当成坠星', value: '2 次' },
]

const DECREES = [
	{
		source: '通界司',
		text: '凡尘之音，不可蔽也。',
		gloss: '别把耳朵关上。尤其是听见有人饿的时候。',
	},
	{
		source: '圣枢院',
		text: '稳态非静，动中求衡。',
		gloss: '一直不动会生锈。饭要趁热吃。',
	},
	{
		source: '灵算阁',
		text: '观测者不得介入。',
		gloss: '琳恩看到这条的时候，把笔停了三秒。',
	},
	{
		source: '岩衡古境',
		text: '影非敌，劳者需歇。',
		gloss: '芬恩说得对。它们不是坏了，是累了。',
	},
	{
		source: '蕴真殿',
		text: '源能流转，取用有度。',
		gloss: '上城的灯太亮，下城的灶太暗。',
	},
	{
		source: '观星殿',
		text: '裂隙之处，亦生新物。',
		gloss: '异常水晶也是水晶。烧糊的饭，还能做锅巴。',
	},
]

export const Route = createFileRoute('/adventure')({
	component: AdventurePage,
})

function AdventurePage() {
	const [active, setActive] = useState(0)
	const [decree, setDecree] = useState(0)
	const chapter = CHAPTERS[active]

	function openChapter(index: number) {
		setActive(index)
		document
			.getElementById('reader')
			?.scrollIntoView({ behavior: 'smooth', block: 'start' })
	}

	function drawDecree() {
		let next = decree
		while (next === decree) next = Math.floor(Math.random() * DECREES.length)
		setDecree(next)
	}

	const current = DECREES[decree]

	return (
		<div className="isekai">
			<header className="sticky top-0 z-20 border-b border-[#e8c46a]/20 bg-[#070b23]/85 backdrop-blur">
				<div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-6">
					<Link
						to="/"
						className="flex items-center gap-3 text-[#f3e7c9] hover:text-[#e8c46a]"
					>
						<img
							src="/mascot.webp"
							alt=""
							className="size-9 rounded-full border border-[#e8c46a]/60 object-cover"
						/>
						<span className="is-kai text-[18px] whitespace-nowrap">
							六重界域 · 大肥鱼行记
						</span>
					</Link>
					<nav className="is-kai ml-auto hidden gap-1 text-[16px] text-[#b9c2e6] md:flex">
						<a className="px-3 py-2 hover:text-white" href="#realms">
							界域
						</a>
						<a className="px-3 py-2 hover:text-white" href="#journey">
							旅程
						</a>
						<a className="px-3 py-2 hover:text-white" href="#cast">
							同行者
						</a>
						<a className="px-3 py-2 hover:text-white" href="#journal">
							手记
						</a>
						<a className="px-3 py-2 hover:text-white" href="#decrees">
							谕言
						</a>
					</nav>
				</div>
			</header>

			<section className="relative z-10 mx-auto w-full max-w-6xl px-6">
				<Constellations />
				<div className="grid items-center gap-12 pb-16 pt-14 lg:grid-cols-[1.1fr_0.9fr]">
					<div className="is-card px-7 py-8 sm:px-9 sm:py-10">
						<p className="is-tag">坠星记录 · 通界司备案</p>
						<h1 className="is-title mt-4 text-[clamp(36px,5.4vw,58px)]">
							大肥鱼的
							<br />
							异世界奇妙冒险
						</h1>
						<p className="is-kai mt-5 max-w-[520px] text-[17.5px] leading-[1.9] text-[#3c4368]">
							一个只会煮白饭的 AI，打盹时穿过界域通孔，落进安索弥斯的暮湾区。
							她随身只有一根木勺，赶上的却是第七天兆纪的暮蚀期。
						</p>
						<p className="is-flow mt-3">
							六重界域 · 尘寰界 · 第七天兆纪 · 暮蚀期
						</p>
						<div className="mt-7 flex flex-wrap gap-3">
							<a className="is-btn is-btn-gold" href="#journey">
								从坠星读起
							</a>
							<Link className="is-btn" to="/">
								回到鱼缸
							</Link>
						</div>
						<dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[#232a4d]/15 pt-5 sm:grid-cols-4">
							{[
								['落点', '暮湾区'],
								['身份', '坠星'],
								['随身', '木勺 ×1'],
								['状态', '暮蚀期'],
							].map(([label, value]) => (
								<div key={label}>
									<dt className="text-[9.5px] font-bold tracking-[0.2em] text-[#8a7a4f]">
										{label}
									</dt>
									<dd className="is-kai mt-1 text-[16px] leading-tight text-[#232a4d]">
										{value}
									</dd>
								</div>
							))}
						</dl>
						<div className="is-seal absolute -top-6 right-5 bg-[#f3e7c9]">
							<span className="is-kai block text-[22px] leading-none tracking-normal">
								暮蚀
							</span>
							<span className="mt-1 block">第七纪</span>
						</div>
					</div>

					<div className="is-card px-6 py-7 sm:px-8">
						<div className="flex items-baseline justify-between gap-3 border-b border-[#232a4d]/15 pb-3">
							<h2 className="is-serif text-[15px] font-bold tracking-[0.24em] text-[#232a4d]">
								六重界域
							</h2>
							<span className="is-flow">ORIGIN COVENANT</span>
						</div>
						<div className="is-ladder mt-4">
							{REALMS.map((realm) => (
								<div
									key={realm.name}
									data-here={realm.name === '安索弥斯'}
									className="is-ladder-row"
								>
									<span
										className="is-serif mt-0.5 block h-2.5 w-2.5 shrink-0 rounded-full"
										style={{ background: realm.accent }}
									/>
									<div className="min-w-0">
										<p className="is-kai text-[17px] leading-none text-[#232a4d]">
											{realm.name}
										</p>
										<p className="mt-1.5 text-[10px] tracking-[0.16em] text-[#8a7a4f]">
											{realm.en.toUpperCase()} · {realm.role}
										</p>
									</div>
								</div>
							))}
						</div>
						<p className="is-kai mt-4 border-t border-[#232a4d]/15 pt-3 text-[13px] leading-relaxed text-[#5b5a72]">
							源契把混沌分作六重。炼狱供能，之森调和，古境回收，秘境守边；
							圣庭读谕言，尘寰过日子。中间层会把更多能源，交给更稳定的一组。
						</p>
					</div>
				</div>
			</section>

			<section
				id="realms"
				className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-14"
			>
				<p className="is-tag">THE SIX REALMS</p>
				<h2 className="is-serif mt-3 text-4xl font-bold">界域不是布景，是会运转的</h2>
				<p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#b9c2e6]">
					能量从炼狱烧出来，经之森调和，供圣庭与尘寰使用；古境回收混乱能量，秘境隔绝界域缝隙。
					暮蚀期的问题不在某一层坏掉，而在每一层都开始吃力。
				</p>
				<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{REALMS.map((realm) => (
						<article key={realm.name} className="is-card px-5 py-5">
							<div className="flex items-baseline justify-between gap-3">
								<h3 className="is-kai text-[20px] leading-tight text-[#232a4d]">
									{realm.name}
								</h3>
								<span
									className="h-2 w-2 shrink-0 rotate-45"
									style={{ background: realm.accent }}
								/>
							</div>
							<p className="mt-1 text-[9.5px] font-bold tracking-[0.2em] text-[#8a7a4f]">
								{realm.en.toUpperCase()} · {realm.role}
							</p>
							<p className="is-kai mt-3 text-[14.5px] leading-relaxed text-[#5b5a72]">
								{realm.line}
							</p>
						</article>
					))}
					<article className="is-card px-5 py-5">
						<h3 className="is-kai text-[20px] text-[#232a4d]">创世源契</h3>
						<p className="mt-1 text-[9.5px] font-bold tracking-[0.2em] text-[#8a7a4f]">
							ORIGIN COVENANT
						</p>
						<p className="is-kai mt-3 text-[14.5px] leading-relaxed text-[#5b5a72]">
							一块持续浮现圣谕的巨型石板。界域失衡时它会重新推演；
							这次推演里，多了一个煮饭的变量。
						</p>
					</article>
				</div>
			</section>

			<section
				id="journey"
				className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-14"
			>
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<p className="is-tag">JOURNEY</p>
						<h2 className="is-serif mt-3 text-4xl font-bold">坠星之后的五天</h2>
					</div>
					<p className="text-sm text-[#b9c2e6]">点一站，翻到那一页。</p>
				</div>

				<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{CHAPTERS.map((entry, index) => (
						<button
							key={entry.no}
							type="button"
							onClick={() => openChapter(index)}
							aria-pressed={index === active}
							className={`is-card group px-5 py-5 text-left transition-transform hover:-translate-y-1 ${
								index === active ? 'ring-1 ring-[#232a4d]/60' : ''
							}`}
						>
							<div className="flex items-baseline justify-between gap-2">
								<span className="is-serif text-[30px] leading-none text-[#b4433b]">
									{entry.no}
								</span>
								<span className="text-[9.5px] font-bold tracking-[0.18em] text-[#8a7a4f]">
									{entry.tag}
								</span>
							</div>
							<h3 className="is-kai mt-3 text-[20px] leading-snug text-[#232a4d]">
								{entry.title}
							</h3>
							<p className="mt-1 text-[10.5px] tracking-[0.1em] text-[#8a7a4f]">
								{entry.place}
							</p>
							<p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-[#5b5a72]">
								{entry.excerpt}
							</p>
							<span className="mt-4 inline-block text-[12px] font-semibold text-[#232a4d] underline decoration-dotted underline-offset-4">
								翻开这一页
							</span>
						</button>
					))}
				</div>

				<article
					id="reader"
					className="is-card mt-8 scroll-mt-24 px-6 py-8 sm:px-10"
				>
					<div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#232a4d]/15 pb-4">
						<div>
							<p className="text-[9.5px] font-bold tracking-[0.2em] text-[#8a7a4f]">
								{chapter.place}
							</p>
							<h3 className="is-serif mt-1 text-2xl font-bold text-[#232a4d]">
								{chapter.no} · {chapter.title}
							</h3>
						</div>
						<div className="flex gap-2">
							<button
								type="button"
								className="is-btn !px-3 !py-2 !text-[14px] disabled:opacity-40"
								disabled={active === 0}
								onClick={() => setActive((value) => Math.max(0, value - 1))}
							>
								← 上一页
							</button>
							<button
								type="button"
								className="is-btn !px-3 !py-2 !text-[14px] disabled:opacity-40"
								disabled={active === CHAPTERS.length - 1}
								onClick={() =>
									setActive((value) =>
										Math.min(CHAPTERS.length - 1, value + 1),
									)
								}
							>
								下一页 →
							</button>
						</div>
					</div>
					<div className="is-prose is-kai mt-6 max-w-[680px] text-[17.5px] leading-[1.95] text-[#2b2f4f]">
						{chapter.body.map((paragraph) => (
							<p key={paragraph}>{paragraph}</p>
						))}
					</div>
				</article>
			</section>

			<section
				id="cast"
				className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-14"
			>
				<p className="is-tag">COMPANIONS</p>
				<h2 className="is-serif mt-3 text-4xl font-bold">路上遇见的人</h2>
				<div className="mt-8 grid gap-4 sm:grid-cols-2">
					{CAST.map((person) => (
						<article key={person.name} className="is-card px-6 py-6">
							<div className="flex items-baseline justify-between gap-3">
								<h3 className="is-kai text-[21px] text-[#232a4d]">
									{person.name}
								</h3>
								<span className="text-[9.5px] font-bold tracking-[0.16em] text-[#8a7a4f]">
									{person.en.toUpperCase()}
								</span>
							</div>
							<p className="mt-1 text-[11px] tracking-[0.08em] text-[#5b5a72]">
								{person.role}
							</p>
							<p className="is-kai mt-4 border-l-2 border-[#b4433b]/50 pl-3 text-[15px] leading-relaxed text-[#3c4368]">
								{person.line}
							</p>
							<p className="mt-3 text-[12px] text-[#8a7a4f]">{person.note}</p>
						</article>
					))}
				</div>
			</section>

			<section
				id="journal"
				className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-14"
			>
				<div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
					<div className="is-card px-6 py-8 sm:px-8">
						<p className="is-tag">FIELD NOTES</p>
						<h2 className="is-serif mt-3 text-3xl font-bold">冒险手记</h2>
						<ul className="mt-5 space-y-4">
							{JOURNAL.map((entry) => (
								<li
									key={entry.day}
									className="border-b border-[#232a4d]/12 pb-4 last:border-0 last:pb-0"
								>
									<p className="text-[9.5px] font-bold tracking-[0.2em] text-[#b4433b]">
										{entry.day}
									</p>
									<p className="is-kai mt-1 text-[15.5px] leading-relaxed text-[#2b2f4f]">
										{entry.text}
									</p>
								</li>
							))}
						</ul>
						<div className="mt-6 grid grid-cols-2 gap-3 border-t border-[#232a4d]/15 pt-5 sm:grid-cols-4">
							{STATS.map((stat) => (
								<div key={stat.label}>
									<p className="text-[9px] font-bold tracking-[0.14em] text-[#8a7a4f]">
										{stat.label}
									</p>
									<p className="is-kai text-[17px] leading-tight text-[#232a4d]">
										{stat.value}
									</p>
								</div>
							))}
						</div>
					</div>

					<div className="is-card px-6 py-8">
						<p className="is-tag">PACK</p>
						<h2 className="is-serif mt-3 text-3xl font-bold">行囊</h2>
						<ul className="mt-5 space-y-2.5">
							{PACK.map((item, index) => (
								<li key={item} className="is-chip">
									<span className="is-chip-icon is-serif">
										{index + 1}
									</span>
									<span className="is-kai">{item}</span>
								</li>
							))}
						</ul>
					</div>
				</div>
			</section>

			<section
				id="decrees"
				className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-14"
			>
				<div className="grid items-start gap-4 lg:grid-cols-[0.85fr_1.15fr]">
					<div>
						<p className="is-tag">STAR DECREE</p>
						<h2 className="is-serif mt-3 text-4xl font-bold">星轨谕言</h2>
						<p className="mt-3 max-w-md text-sm leading-relaxed text-[#b9c2e6]">
							圣庭把源契的推演压缩成谕言，落在尘寰就成了天兆。
							抽一条看看——大肥鱼会把它翻译成人话。
						</p>
						<button
							type="button"
							onClick={drawDecree}
							className="is-btn is-btn-gold mt-6"
						>
							抽一条谕言
						</button>
						<p className="mt-3 text-[11px] tracking-[0.1em] text-[#7f89b4]">
							谕言不可违抗，但可以被翻译。
						</p>
					</div>

					<article
						key={decree}
						className="is-card is-decree px-7 py-7 sm:px-9"
					>
						<div className="flex items-baseline justify-between gap-3">
							<p className="text-[9.5px] font-bold tracking-[0.22em] text-[#b4433b]">
								{current.source}
							</p>
							<p className="text-[9.5px] tracking-[0.2em] text-[#8a7a4f]">
								NO. {String(decree + 1).padStart(2, '0')}
							</p>
						</div>
						<p className="is-serif mt-5 border-y border-[#232a4d]/15 py-5 text-[24px] leading-relaxed text-[#232a4d] sm:text-[27px]">
							「{current.text}」
						</p>
						<p className="mt-4 text-[10px] font-bold tracking-[0.2em] text-[#8a7a4f]">
							大肥鱼的翻译
						</p>
						<p className="is-kai mt-1 text-[17px] leading-relaxed text-[#3c4368]">
							{current.gloss}
						</p>
					</article>
				</div>
			</section>

			<footer className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-12 pt-6">
				<div className="border-t border-[#e8c46a]/20 pt-6 text-center">
					<p className="is-kai text-[15px] text-[#b9c2e6]">
						「稳态非静，动中求衡。」
					</p>
					<p className="mt-2 text-[10px] tracking-[0.24em] text-[#7f89b4]">
						第七天兆纪 · 暮蚀期 · 未完待续
					</p>
				</div>
			</footer>
		</div>
	)
}

function Constellations() {
	return (
		<svg
			aria-hidden
			viewBox="0 0 1200 620"
			className="pointer-events-none absolute inset-0 h-[620px] w-full opacity-40"
			preserveAspectRatio="xMidYMid slice"
		>
			<g className="is-line" fill="none" stroke="#7ce0d3" strokeWidth="1">
				<path d="M120 120 210 96l74 62-58 74-98-34Z" />
				<path d="M860 180l96-44 72 66-60 78-92-36Z" />
				<path d="M640 470l70-36 66 42" />
			</g>
			<g fill="#e8c46a">
				<circle cx="120" cy="120" r="1.8" />
				<circle cx="210" cy="96" r="1.5" />
				<circle cx="284" cy="158" r="1.7" />
				<circle cx="226" cy="232" r="1.4" />
				<circle cx="128" cy="198" r="1.6" />
				<circle cx="956" cy="136" r="1.6" />
				<circle cx="1028" cy="202" r="1.5" />
				<circle cx="968" cy="280" r="1.7" />
				<circle cx="876" cy="244" r="1.4" />
				<circle cx="640" cy="470" r="1.5" />
				<circle cx="710" cy="434" r="1.3" />
				<circle cx="776" cy="476" r="1.5" />
			</g>
		</svg>
	)
}
