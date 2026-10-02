/**
 * 色值真源（重构期暂驻 rise-global）
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── 值是 OKLCH，不是 HSL 通道值（freeland#214，2026-09-05）────────────────
 * 消费方直接写 `var(--background)` —— **不再套 `hsl()`**。
 *
 * 换格式的三条理由：
 *   ① **原值本来就是 oklch**。shadcn base-nova 官方给的是 oklch，此前每一行都配着
 *      `// oklch(0.97 0 0)` 注释作对照 —— 那说明左边的 HSL 是转换产物。而转换有损：
 *      官方 `oklch(0.205)` 转成 HSL 是 `9.1%`，再转回来变成 `0.206`。
 *   ② **Tailwind v4 原生就是 oklch**，HSL 通道值是在往回退一步。
 *   ③ **HSL 通道值咬过人**：`color-mix(in oklch, var(--secondary), …)` 里
 *      `var(--secondary)` 展开是 `0 0% 96%`（一串裸数字），不是合法颜色，
 *      整条声明失效、hover 背景整块消失（freeland#206）。当时的修法是套一层 `hsl()`，
 *      那是在给格式打补丁。OKLCH 下 `var(--x)` 本身就是合法颜色，这类问题从根上没有。
 *
 * 灰阶 `N` 表用的是**官方 oklch 原值**，不是从 HSL 算回来的 —— 那样会把 ① 说的
 * 那点损失又带进来。其余值（surface scale、状态色、navy）没有 oklch 源，是算的。
 *
 * ⚠️ 这份是 `@theriseunion/tokens` 的 colors.ts 在重构期的**本地接管版**，
 *    与 design/（暂驻的 @theriseunion/ui）同进退：定稿后整体回归 rise-design-v3。
 *    收归的理由见 tokens/README.md —— 一句话：重构期色值改动频繁，
 *    每改一次都走「rise-design-v3 发版 → rise-global bump」太慢。
 *
 * 只接管**构建期**的色值。运行时的 `buildPrimaryTheme` / `PrimaryTheme` 仍从
 * npm 包引入（那是换主色的算法，不含色值，稳定、无需接管）。
 *
 * ── 格式 ──────────────────────────────────────────────────────────────────
 * HSL 通道值（`221.2 83.2% 53.3%`，不带 hsl() 包裹），与上游同格式。
 *
 * **刻意不切 oklch**，尽管 base-nova 官方是 oklch：全仓有 49 处手写
 * `var(--x)`，切色彩空间会让它们全部静默失效（产出无效颜色）。而这一批
 * 已经在动「每一个灰」，再叠一层色彩空间迁移，视觉回归就归不了因。
 * oklch 迁移作为独立一步单独做（届时连同那 49 处一起 sed）。
 * 下方所有取自官方的值，均由 oklch→sRGB→HSL 精确换算得来，非目测。
 *
 * ── 基调：neutral（纯中性灰），不再是 slate ────────────────────────────────
 * 原先全套是 slate（chroma 0.046，偏蓝）。既然未来 UI 底子是 shadcn base-nova，
 * 灰阶一次归到官方的 neutral（chroma 0）。这会改变**浅色模式**的全站观感
 * ——冷调偏蓝的灰 → 纯灰，不是暗色。
 *
 * 过渡期会有一道接缝：console 里 11k 处硬编码用的是 Tailwind `gray-*`
 * （chroma 0.027，介于两者之间），未迁完之前与 token 区域并排会有微小色差。
 * 文字上看不出，大面积背景才察觉；随迁移推进自动消失。
 */

/** 官方 neutral 基调的灰阶（oklch L → HSL，chroma 全为 0 故 H/S 均为 0） */
const N = {
  100: 'oklch(1 0 0)', //     #FFFFFF
  98: 'oklch(0.985 0 0)', //  #FAFAFA · neutral-50
  96: 'oklch(0.97 0 0)', //   #F5F5F5 · neutral-100
  90: 'oklch(0.922 0 0)', //  #E5E5E5 · neutral-200
  83: 'oklch(0.87 0 0)', //   #D4D4D4 · neutral-300
  63: 'oklch(0.708 0 0)', //  #A3A3A3 · neutral-400
  45: 'oklch(0.556 0 0)', //  #737373 · neutral-500
  37: 'oklch(0.371 0 0)', //  #404040 · neutral-700
  15: 'oklch(0.269 0 0)', //  #262626 · neutral-800
  9: 'oklch(0.205 0 0)', //   #171717 · neutral-900
  4: 'oklch(0.145 0 0)', //   #0A0A0A · neutral-950
}

// ---------------------------------------------------------------------------
// 主色：跟 shadcn 官方 neutral
// ---------------------------------------------------------------------------
//
// 取官方 base-nova + neutral 的原值：
//   浅色 oklch(0.205 0 0) = #171717 = Tailwind neutral-900
//   暗色 oklch(0.922 0 0) = #E5E5E5 = Tailwind neutral-200
// 色度为 0，完全无彩 —— shadcn 的七个基色（Neutral / Stone / Zinc / Mauve /
// Olive / Mist / Taupe）全是中性灰阶，彩色不在基色层。
//
// 早前这里是蓝色（#2563EB），注释写着「官方那个近黑只是 baseColor 选 neutral 的
// 副产品，不是必须跟的东西」。**那条论断已被推翻**：灰阶上一轮就跟了
// shadcn base-nova（slate → neutral），主色是漏下的那一层，不是刻意保留的差异。
// 删掉而不是补一句 —— 留着会让下一个人照它把主色改回彩色。
//
// **为什么暗色取 0.922 而不是更白**：纯白（0.985）主色在深色底上大面积会晃眼，
// 官方收到 0.922 是有实际道理的，不是随手取的。
// 直接复用灰阶表，不写字面值 —— 两处各写一遍迟早对不上。
const BRAND = {
  light: N[9], // #171717 · neutral-900 · oklch(0.205 0 0)
  dark: N[90], // #E5E5E5 · neutral-200 · oklch(0.922 0 0)
}

// chrome（顶栏 / 侧栏 / 工作空间选择器）的 navy —— 这是 rise-global 的招牌质感，
// 明确保留。它以前**没有自己的身份**：顶栏借 `bg-secondary` + 子树挂 `.dark`
// 拿到 darkColors.secondary(#1E293B)，所以灰阶一归 neutral 就会跟着变成纯灰。
// 现在给它独立的 sidebar-* 一组（正是 shadcn 为「chrome 自成配色」留的位置），
// 与内容区的灰彻底解耦 —— 内容跟官网，chrome 保 navy，互不影响。
//
// ⚠️ navy **不放在 sidebar-* 的任何一档**，而是自成 `--chrome-*` 一组、
//    :root 与 .dark 同值（即与明暗无关，恒为 navy）。原因是这两件事必须分开：
//
//      浅色页 + 深色 chrome（semiDarkHeader）→ 要 navy
//      整站暗色模式                          → 要中性，navy 在这儿不协调
//
//    而 `useShellTheme` 实现深色 chrome 的手段是给子树挂 `.dark` —— 这让两种
//    场景读到**同一档值**，靠 sidebar-* 本身区分不开。
//
//    所以 navy 存进 --chrome-*，由 useShellTheme 在「浅色页 + 深色 chrome」这
//    一种情况下用 inline style 把 --sidebar 指过去（inline 优先级高于 .dark 的
//    类规则）。整站暗色时不注入，sidebar-* 保持中性档。
//
// 为什么暗色下不该有 navy：navy 顶栏本质是个**对比装置** —— 深色 chrome 压在
// 浅色内容上才成立。整页都深时这个对比不存在，残留的蓝色相就跟中性内容脱节。
// 官方暗色 sidebar 也是中性(oklch(0.205 0 0))。
const NAVY = 'oklch(0.28 0.037 260)' // #1E293B
const NAVY_HOVER = 'oklch(0.372 0.039 257.3)' // #334155

// 状态色：官方**根本不管状态色**（32 个标准 token 里没有 success/warning/info），
// 所以这三组是我们自己的。取值沿用 cockpitColors 里早已定稿的那套，含暗色提亮
// 一档；本次只是把它们从「只有 --cockpit-* hex 变量」提升为一等 token
// （进 theme.colors → 有 bg-success 类 → 支持 bg-success/10 透明度修饰符）。
// error 不另立：与 destructive 共用一个红，避免站内出现两种「错误红」。

/** @type {Record<string, string>} */
const lightColors = {
  background: N[100],
  foreground: N[4],
  card: N[100],
  'card-foreground': N[4],
  popover: N[100],
  'popover-foreground': N[4],
  // tooltip：深色只读浮层，**不跟主色走**（AntD / EP 默认也是深底）。此前直接用 foreground
  // （neutral-950 纯黑），蓝色主题下像一块黑主色；降到 neutral-700，身份不变、肉眼可辨地
  // 不再是黑（neutral-800 试过，与纯黑差别看不出来，LF 2026-09-07）。暗色下对称：
  // near-white 降到 neutral-300。
  tooltip: N[37],
  'tooltip-foreground': N[98],
  primary: BRAND.light,
  'primary-foreground': N[98],
  secondary: N[96],
  'secondary-foreground': N[9],
  muted: N[96],
  'muted-foreground': N[45],
  accent: N[96],
  'accent-foreground': N[9],
  // 刻意不跟官网：官方是 oklch(0.577 0.245 27.325) = 357.2 100% 45.3%，**饱和度
  // 100%**，而我们其余状态档是 80~96%。红在 rise-global 的主力场景是**状态点和
  // 删除按钮**（信息密度极高的列表），不是官网 demo 里偶尔出现的强调 —— 满饱和
  // 的红会让一个失败的 Pod 比整张表都响。退回原值 #EF4444(S 84%)，五档才均衡。
  destructive: 'oklch(0.637 0.208 25.3)', // #EF4444
  'destructive-foreground': N[98], // 官方新版已删此键，我们保留（存量在用）
  border: N[90],
  input: N[90],
  // 官方 neutral 的 ring 是灰（0 0% 63%）—— 同样是近黑 primary 的副产品。
  // 我们主色是蓝，焦点环跟着主色才对，故沿用品牌蓝。
  ring: BRAND.light,

  // ── 状态色（我们独有，官方无）────────────────────────────────────────
  success: 'oklch(0.704 0.123 182.5)', // #14B8A6
  'success-foreground': N[98],
  warning: 'oklch(0.769 0.165 70.1)', // #F59E0B
  'warning-foreground': N[9], // 琥珀底压深字才读得清
  info: 'oklch(0.623 0.188 259.8)', // #3B82F6
  'info-foreground': N[98],

  // ── 代码块 / 编辑器（CodeEditor 的 Monaco 主题与 CodeBlock 的 CSS 同源）────
  // 两块代码摆在同一页里，用户分不出哪块是 Monaco、哪块是轻量块，只看得出字体、底色、
  // 高亮不一样。所以颜色只在这里定一份：Monaco 主题在运行时读这些 CSS 变量生成，
  // CodeBlock 直接 var() 引用 —— 改一处两边同时变，暗色也自然跟随（freeland#352）。
  // 取值对齐 VS Code Light+ 的常用五色，压过饱和度一档，压在 Inter 正文旁不刺眼。
  'code-bg': N[100],
  'code-fg': N[4],
  'code-line-number': N[55],
  'code-selection': 'oklch(0.9 0.04 250)',
  'code-comment': 'oklch(0.52 0.12 142)', // 注释 · 绿
  'code-keyword': 'oklch(0.48 0.2 264)', // 关键字 · 蓝
  'code-string': 'oklch(0.48 0.16 27)', // 字符串 · 砖红
  'code-number': 'oklch(0.55 0.12 165)', // 数字 · 青绿
  'code-key': 'oklch(0.42 0.15 258)', // YAML / JSON 键 · 深蓝

  // ── chart（官方 neutral 的 chart-1..5 是灰阶单色，做不了数据可视化）──────
  // 改用我们 chartColors 里的分类色板取前五。刻意跳过红 —— 红有语义含义
  // （destructive/error），做默认数据系列会被误读成「这条线出问题了」。
  //
  // **序列色与 --primary 无关**（shadcn 的约定，形状照抄上游）。
  //
  // 曾考虑让 series[0] 跟随主色（console-ui 的做法），否决了 —— 决定性的理由是
  // **偏好设置里的主色是取色器，不是预设列表**（`ThemePreferences.primaryCustom`，
  // 覆盖 `--primary` 一个 inline 变量）。用户完全可以选一个正好等于 chart-2 的
  // 翠绿，那时第一、二条线就是同一个颜色。这不是假设，是取色器的必然可达状态。
  // console-ui 承认了这个风险并选择接受（「这是预设的设计意图」），我们不必 ——
  // 调色板的全部意义就是「彼此可区分」。
  //
  // 推论（给主题桥）：**换主色时图表不需要任何反应**。这是设计，不是漏了。
  // 需要反应的只有两件：换明暗要重建实例（ECharts 不吃 CSS 变量），
  // 换密度要重设字号。chrome 皮肤（tokens/themes.ts 的 6 套）只改顶栏侧栏的
  // class，不碰内容区，与图表无关。
  'chart-1': 'oklch(0.623 0.188 259.8)', // #3B82F6 blue-500
  'chart-2': 'oklch(0.696 0.149 162.5)', // #10B981 emerald-500
  'chart-3': 'oklch(0.769 0.165 70.1)', // #F59E0B amber-500
  'chart-4': 'oklch(0.606 0.219 292.7)', // #8B5CF6 violet-500
  'chart-5': 'oklch(0.715 0.126 215.1)', // #06B6D4 cyan-500
  // chart-6..10 只给显式 `topN`（最多 10）的 Top-N 实体趋势图用。取 600 色阶、比前五深一档，
  // 靠明度拉开与色相相近的前五（蓝–天蓝、青–天蓝）。10 色两两 OKLab 距离 ≥ 0.06 由 theme.test.ts 守住。
  'chart-6': 'oklch(0.592 0.218 0.6)', // #DB2777 pink-600
  'chart-7': 'oklch(0.591 0.257 322.9)', // #C026D3 fuchsia-600
  'chart-8': 'oklch(0.646 0.194 41.1)', // #EA580C orange-600
  'chart-9': 'oklch(0.648 0.175 131.7)', // #65A30D lime-600
  'chart-10': 'oklch(0.588 0.139 242.0)', // #0284C7 sky-600
  // Top-N 聚合的「其它」—— shadcn 没有这个概念（它不做聚合），是我们的扩展。
  // 必须是中性色：它代表「剩下那些」，给任何一个色相都会被读成一个具体类别。
  'chart-others': N[63], // #A1A1A1


  // ── chrome（浅色页上的深色顶栏/侧栏）——与明暗无关，两档同值 ──────────────
  // 由 useShellTheme 在「浅色页 + 深色 chrome」时把 --sidebar 指到这里。
  chrome: NAVY,
  'chrome-accent': NAVY_HOVER,
  'chrome-foreground': N[98],

  // ── sidebar 浅色档：近白，与官方一致 ────────────────────────────────────
  sidebar: N[98],
  'sidebar-foreground': N[9],
  'sidebar-primary': BRAND.light,
  'sidebar-primary-foreground': N[98],
  'sidebar-accent': N[96],
  'sidebar-accent-foreground': N[9],
  'sidebar-border': N[90],
  'sidebar-ring': BRAND.light,

  // ── Surface scale（我们独有的层次语言，官方无）──────────────────────────
  // 「灰底 + 白卡浮起」是 Edge Console 的核心视觉语言：
  //   page（内容区底，最暗）< section < toolbar < card（浮起，最亮）
  // 原值是 slate 系（H=210~220, S=33~50%），随本次基调统一去色 → 纯中性灰，
  // 相对明度关系逐档保持不变（95.7 / 97.1 / 98.4 / 100）。
  'surface-page': 'oklch(0.967 0 0)',
  'surface-toolbar': 'oklch(0.988 0 0)',
  'surface-section': 'oklch(0.978 0 0)',
  'surface-dialog-header': 'oklch(0.991 0 0)',
  'surface-monitor': 'oklch(0.969 0 0)',
  // 画布 —— **板外面那一圈底**。默认布局下没有"板"，它与 `surface-page` 同值，
  // 视觉上看不出这是两个 token；极简布局把两者拉开：画布浅灰、内容区随板变白。
  //
  // 为什么必须分家：页面代码写的是 `bg-surface-page`（内容区底），而 AppShell 的
  // 最外层也要一个底色。共用一个 token 时，极简下把它调白 → 板浮不起来；
  // 调灰 → 板里又铺了一层灰。两个诉求在同一个变量上不可能同时满足。
  'surface-canvas': 'oklch(0.967 0 0)',
  // 外壳板 —— 「顶栏 + 内容区合成的那一块」。`card`（卡片）语义对不上：
  // 卡片是内容里的一个块，外壳板是**装内容的那个容器**。
  //
  // 默认档下没有"外壳板"这个形态，取与 card 同值 —— 消费它的地方在默认布局里
  // 退化成白，不会出错。极简布局（freeland#210）把它和 page 拉开，那时它才真的是一块板。
  'surface-shell': N[100],
  // 禁用面 —— **不属于上面那条明暗层次**（page < section < toolbar < card 讲的是
  // 「浮起多高」），它表达的是状态：这块不给动。所以方向相反 —— 比 `muted`(N96) 更深。
  //
  // 为什么不能复用 `muted`：`--muted` 是本仓复用最狠的 token（页签轨道、悬停底、
  // `FormSection` 分区标题条都读它）。禁用字段若也落在 muted 一档，就和分区标题条
  // 分不开，一列灰块糊成一片（LF 2026-09-17 反馈）。压到 40% 叠白又淡到看不见 ——
  // 往深了拉开才成立，浅到看不见等于没有禁用态。
  //
  // 也不要直接用 `input`：那是输入框边框色，语义对不上，调边框会把禁用底一起带偏。
  //
  // 取值 #f1f2f3（LF 2026-09-21 定）。它比 muted 只深 0.009，单看色块几乎同色 ——
  // 与标题条的区分**落在边框上**：标题条无边框，禁用字段有。表单画布是白的
  // （filled 下不铺灰底），所以在白底上这一档是看得见的。
  'surface-disabled': 'oklch(0.961 0 0)',
}

/** @type {Record<string, string>} */
const darkColors = {
  background: N[4],
  foreground: N[98],
  // 卡片比页面底亮 = 浮起（官方 neutral 暗色本就如此，与我们原先的层次模型一致）
  card: N[9],
  'card-foreground': N[98],
  popover: N[9],
  'popover-foreground': N[98],
  tooltip: N[83],
  'tooltip-foreground': N[9],
  primary: BRAND.dark,
  'primary-foreground': N[9],
  secondary: N[15],
  'secondary-foreground': N[98],
  muted: N[15],
  'muted-foreground': N[63],
  accent: N[15],
  'accent-foreground': N[98],
  destructive: 'oklch(0.711 0.166 22.2)', // #F87171 —— 暗色提亮一档，与 cockpit danger 同源
  'destructive-foreground': N[9],
  // 官方暗色 border/input 是 `oklch(1 0 0 / 10%)`（白色半透明）。HSL 通道格式
  // 表达不了 alpha —— 消费方写的是 `var(--border)`，alpha 会被吞掉。
  // 故取视觉等效的不透明值：白 10% 压在 #0A0A0A 上 ≈ L15%，即 secondary 档。
  border: N[15],
  input: 'oklch(0.301 0 0)', // 白 15% 的等效值，比 border 略亮（官方也是这个相对关系）
  ring: BRAND.dark,

  success: 'oklch(0.785 0.132 182)', // #2DD4BF —— 暗色提亮一档
  'success-foreground': N[9],
  warning: 'oklch(0.837 0.164 84.5)', // #FBBF24
  'warning-foreground': N[9],
  info: 'oklch(0.713 0.144 254.6)', // #60A5FA
  'info-foreground': N[9],

  // 代码块 / 编辑器（对齐 VS Code Dark+，见上面 light 的注释）
  'code-bg': N[9],
  'code-fg': N[90],
  'code-line-number': N[55],
  'code-selection': 'oklch(0.4 0.05 250)',
  'code-comment': 'oklch(0.63 0.1 135)',
  'code-keyword': 'oklch(0.68 0.11 245)',
  'code-string': 'oklch(0.7 0.09 45)',
  'code-number': 'oklch(0.82 0.06 130)',
  'code-key': 'oklch(0.85 0.07 230)',

  // 分类色板在暗底上同样可读（均为 L≈40~66% 的中高明度），不另提亮：
  // 图表是大面积色块并置，逐档提亮反而会削弱彼此的区分度。
  // 暗色提亮一档（500 → 400），与本文件 success / warning / info / destructive
  // 的处理完全一致。此前这五个与浅色**同值**，是漏做 —— 深底上 chart-2
  // （L 39.4%）压得很闷，而同一份 token 里其它状态色都提亮了。
  'chart-1': 'oklch(0.713 0.144 254.6)', // #60A5FA blue-400
  'chart-2': 'oklch(0.773 0.154 163.2)', // #34D399 emerald-400
  'chart-3': 'oklch(0.837 0.164 84.5)', // #FBBF24 amber-400
  'chart-4': 'oklch(0.709 0.159 293.5)', // #A78BFA violet-400
  'chart-5': 'oklch(0.797 0.134 211.4)', // #22D3EE cyan-400
  'chart-6': 'oklch(0.725 0.175 349.8)', // #F472B6 pink-400
  'chart-7': 'oklch(0.748 0.207 322.2)', // #E879F9 fuchsia-400
  'chart-8': 'oklch(0.758 0.159 55.9)', // #FB923C orange-400
  'chart-9': 'oklch(0.849 0.207 128.8)', // #A3E635 lime-400
  'chart-10': 'oklch(0.754 0.139 232.7)', // #38BDF8 sky-400
  // 「其它」在暗色下要压暗一档：浅色用 N[63] 是为了在白底上够沉，
  // 深底上同一个值会比多数序列色还亮，反而抢眼。
  'chart-others': N[45], // #737373


  // ── chrome（浅色页上的深色顶栏/侧栏）——与明暗无关，两档同值 ──────────────
  // 由 useShellTheme 在「浅色页 + 深色 chrome」时把 --sidebar 指到这里。
  chrome: NAVY,
  'chrome-accent': NAVY_HOVER,
  'chrome-foreground': N[98],

  // ── sidebar 暗色档：中性，与官方一致（navy 见上方 --chrome-*）──────────────
  // sidebar(9.1%) 比页面底(3.9%)亮 = chrome 浮在内容之上；
  // sidebar-accent(14.9%) 再亮一档，供 chrome 上的控件（如作用域选择器）落座。
  sidebar: N[9],
  'sidebar-foreground': N[98],
  'sidebar-primary': BRAND.dark,
  'sidebar-primary-foreground': N[98],
  'sidebar-accent': N[15],
  'sidebar-accent-foreground': N[98],
  'sidebar-border': N[15],
  'sidebar-ring': BRAND.dark,

  // 镜像浅色的相对层次：page < section < toolbar < card
  // 浅色 95.7 < 97.1 < 98.4 < 100  ／  暗色 6 < 9 < 11 < 13(card=9.1)
  'surface-page': 'oklch(0.17 0 0)',
  'surface-toolbar': 'oklch(0.227 0 0)',
  'surface-section': 'oklch(0.204 0 0)',
  'surface-dialog-header': 'oklch(0.227 0 0)',
  'surface-monitor': 'oklch(0.182 0 0)',
  'surface-canvas': 'oklch(0.17 0 0)', // 同浅色：默认档与 surface-page 同值
  'surface-shell': N[9], // 同浅色：默认档与 card 同值
  // 禁用面。暗色下"拉开"的方向与浅色相反（要更亮）；浅色那 0.009 的步长在暗背景上
  // 完全看不出来，故取到 input(0.301) 一线，与 muted(0.269) 拉开约 0.03。
  'surface-disabled': 'oklch(0.30 0 0)',
}

// ---------------------------------------------------------------------------
// 彩色主题的柔和文字阶（LF 2026-09-09 定）
// ---------------------------------------------------------------------------
//
// 默认档（中性主色）的正文是 neutral-950 #0A0A0A —— 跟 shadcn 官方，和近黑的主色是
// 一套语言。主色一旦是彩色（蓝 / 紫 / 深绿 / 橙 / 自定义），近黑正文压在彩色旁边就显硬，
// console-ui 老版在这一点上更柔：正文 #383838、次级 #7c7c7c。
//
// 只柔和**浅色**下的两个文字 token（连带 card / popover 的前景，它们各自独立声明，
// 不写就停在黑上）。暗色不动 —— 没有对应的暗色阶，照搬只会更亮不会更柔。
//
// 生效条件不在这里：由宿主打 `data-primary-tone="colored"`（console 的偏好契约），
// preset 在 `:root[data-primary-tone=colored]:not(.dark)` 上重声明这几个变量。
// 值是 console-ui frappe 主题的原值经 sRGB → OKLab 精确换算，非目测。
const softText = {
  foreground: 'oklch(0.341 0 0)', //       #383838
  'card-foreground': 'oklch(0.341 0 0)',
  'popover-foreground': 'oklch(0.341 0 0)',
  'muted-foreground': 'oklch(0.586 0 0)', // #7C7C7C
}

// `N` 也导出 —— `palettes.js` 要按同一张灰阶表取值，两处各写一遍迟早对不上。
module.exports = { lightColors, darkColors, softText, N }
