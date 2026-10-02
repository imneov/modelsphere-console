/**
 * Tailwind preset（重构期暂驻 rise-global）
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **完整真源，不再包装上游**（freeland#212，2026-09-05）。
 *
 * 此前是「继承 `@theriseunion/tokens/tailwind-preset`、只接管颜色层」。改成自立的
 * 理由：终局是「清空 rise-design-v3、本仓的回归过去」，留一半在上游最后会变成两个
 * 来源要合并 —— 那时谁是真源就说不清了。
 *
 * 三个来源，都在同目录：
 *   `colors.js`        语义色（HSL 通道值 → Tailwind 颜色类）
 *   `viz-colors.js`    监控面板 / 拓扑图色板（hex → CSS 变量）
 *   `design-tokens.js` 圆角 / 阴影 / 字族 / 动效
 *
 * 上游有而这里**刻意不要**的两项（zIndex 语义档、breakpoints）见 `design-tokens.js`
 * 的头注释 —— 一个在 v4 下根本不生成、一个已被 v4 内建取代，两个都 0 处消费。
 *
 * ── 只有一个 addBase 插件，这条不能破 ────────────────────────────────────
 * 产出的 CSS 必须是**所有 `:root` 在前、所有 `.dark` 在后**。
 *
 * 曾经是「上游插件 + 追加一个覆盖插件」，产出变成
 * `:root{上游} .dark{上游} :root{我的} .dark{我的}` —— 一个 `:root` 排在了 `.dark`
 * 之后。那正是 `verify:tokens` 里「.dark 未被 :root 压制」要拦的形状，本仓真实
 * 踩过：globals.css 的一份 :root 排在 preset 的 .dark 之后、特异性相同，把暗色
 * 整个覆盖回浅色，**静默两个月**（见 verify-design-tokens.js 文件头）。
 *
 * 纳管之后没有上游插件可继承了，这个形状天然成立 —— 但**别再往 plugins 里加第二个
 * addBase**，加了就回到那个形状。
 */

const {
  radius,
  radiusBase,
  shadows,
  fontFamily,
  fontSizeBase,
  keyframes,
  animation,
} = require('./design-tokens.cjs')
const { lightColors, darkColors, softText } = require('./colors.cjs')
const {
  cockpitColors,
  darkCockpitColors,
  topologyColors,
  darkTopologyColors,
} = require('./viz-colors.cjs')
const { buildSemanticColors } = require('./build-semantic-colors.cjs')

const cssVars = (tokens) =>
  Object.fromEntries(Object.entries(tokens).map(([k, v]) => [`--${k}`, v]))

/** cockpit 用驼峰键，转 kebab 并加 `--cockpit-` 前缀（消费方写 `var(--cockpit-border)`）。 */
const cockpitVars = (tokens) =>
  Object.fromEntries(
    Object.entries(tokens).map(([k, v]) => [
      `--cockpit-${k.replace(/([A-Z])/g, '-$1').toLowerCase()}`,
      v,
    ])
  )

const topologyVars = (c) => ({
  '--topology-bg': c.bg,
  '--cluster': c.cluster,
  '--cluster-foreground': c.clusterForeground,
  '--node-group': c.nodeGroup,
  '--node-group-foreground': c.nodeGroupForeground,
  '--node': c.node,
  '--node-foreground': c.nodeForeground,
})

/**
 * 过渡态（部署中 / 启动中 / 删除中）的涟漪。
 *
 * **不用 Tailwind 的 `animate-ping`**：ping 是 `75%,100% { scale(2); opacity:0 }`
 * 配 `cubic-bezier(0,0,0.2,1)` —— 先猛地炸开、再静止四分之一个周期。那个语义是
 * 「这里有新东西，看我」（通知红点），不是「正在进行，请稍候」。用在部署中上
 * 表达出来是警告而非等待；表格里十几行同时炸，页面像圣诞树。
 *
 * 这里改成匀速外扩、缓慢淡出、不留停顿 —— 读起来是「在动、请等」。
 * 幅度也收窄（1.9 而非 2），避免相邻行的涟漪互相压边。
 */
const statusHalo = {
  keyframes: {
    /**
     * 表格「已有数据、正在刷新」时顶部那条细进度条。
     *
     * 刻意不是 0→100% 的确定式进度：刷新的耗时未知，假装知道进度是在骗人。
     * 一段短条来回滑动传达的是「在动、别急」，这是不确定进度的正确表达。
     */
    'loading-slide': {
      '0%': { transform: 'translateX(-100%)' },
      '100%': { transform: 'translateX(400%)' },
    },
    'status-halo': {
      '0%': { transform: 'scale(1)', opacity: '0.45' },
      '100%': { transform: 'scale(1.9)', opacity: '0' },
    },
  },
  animation: {
    'status-halo': 'status-halo 1.8s ease-out infinite',
    'loading-slide': 'loading-slide 1.2s ease-in-out infinite',
  },
}

const localPreset = {
  darkMode: ['class'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: buildSemanticColors(lightColors),
      boxShadow: shadows,
      fontFamily,
      // ── 补 DEFAULT 档：让裸 `rounded` 也跟 token ────────────────────────
      // 上游的 borderRadius 只有 none/sm/md/lg/xl/full，**没有 DEFAULT**。
      // 于是 `rounded`（不带后缀）会掉回 Tailwind 内置的 0.25rem —— 一个**写死的、
      // 不跟 --radius 的值**：主题调圆角、密度换档，它纹丝不动。
      //
      // 失败是静默的（CSS 照常生效，只是不跟主题），而包里现有 25 处裸 rounded，
      // 逐个改成 rounded-md 是治标；补上 DEFAULT 才是治本，且对存量零改动。
      // 取值与 md 一致 —— Tailwind 内置的 DEFAULT(0.25rem) 也正是介于 sm 和 lg 之间。
      borderRadius: {
        ...radius,
        DEFAULT: 'calc(var(--radius) - 2px)',
      },
      keyframes: { ...keyframes, ...statusHalo.keyframes },
      animation: { ...animation, ...statusHalo.animation },
    },
  },
  plugins: [
    function ({ addBase }) {
      addBase({
        ':root': {
          // ── 字号与行高派生自 --font-size-base ────────────────────────────
          // Tailwind 的 `--text-sm` 等**默认是写死的绝对值**（0.875rem），与
          // `--font-size-base` 毫无关系。而本仓每个元素都带 text-xs/text-sm 显式
          // 类，于是 preset 里那句 `body { font-size: var(--font-size-base) }`
          // **管不到任何东西** —— 这就是「字号偏好设了没反应」的全部原因：
          // 线是通的，只是接到了一个没有消费者的地方。
          //
          // 改成派生之后，密度偏好改一个 --font-size-base，全站文字跟着走，
          // 组件一行不用碰。系数沿用 Tailwind 默认比例（相对 1rem=16px）。
          // 小字号带**可读性下限**，不做等比缩放。
          // 等比的话紧凑档 text-xs = 13.714 × 0.75 = 10.3px —— 中文在 10px 以下
          // 基本糊成一团，而 text-xs 承载的恰恰是辅助信息（ID、单位、次要说明），
          // 本来就最难读。max() 把地板钉在 11 / 12px，大档照常等比放大。
          '--text-xs': 'max(11px, calc(var(--font-size-base) * 0.75))',
          '--text-sm': 'max(12px, calc(var(--font-size-base) * 0.875))',
          '--text-base': 'var(--font-size-base)',
          '--text-lg': 'calc(var(--font-size-base) * 1.125)',
          '--text-xl': 'calc(var(--font-size-base) * 1.25)',
          '--text-2xl': 'calc(var(--font-size-base) * 1.5)',
          '--text-3xl': 'calc(var(--font-size-base) * 1.875)',
          // 行高同样要派生：字号变大而行高不动，大档下文字会挤成一坨。
          // 用无单位倍数，这样它本身就是相对字号的。
          '--text-xs--line-height': 'calc(1 / 0.75)',
          '--text-sm--line-height': 'calc(1.25 / 0.875)',
          '--text-base--line-height': 'calc(1.5 / 1)',
          '--text-lg--line-height': 'calc(1.75 / 1.125)',
          '--text-xl--line-height': 'calc(1.75 / 1.25)',
          '--text-2xl--line-height': 'calc(2 / 1.5)',
          '--text-3xl--line-height': 'calc(2.25 / 1.875)',
          '--radius': radiusBase,
          // ── Tailwind v4 的 --radius-* 主题变量 ────────────────────────────
          // 必须显式输出。本仓是 v3 风格 config（theme.borderRadius）经 @config
          // 兼容层跑在 v4 上，那条路径只产出 `.rounded-md` 这类**工具类**，
          // 不会反向生成 `--radius-md` 这些**变量**。
          //
          // 而 shadcn base-nova 的生成件是按 v4 写的，尺寸变体里直接写
          // `rounded-[min(var(--radius-md),10px)]` —— 变量不存在 → min() 求值失败
          // → border-radius 掉回 preflight 的 0。表现是 **size="sm" / "icon-sm"
          // 的按钮全是直角**，而默认尺寸（走 rounded-lg → var(--radius)）却是圆的。
          //
          // 失败是静默的：CSS 不报错，只是圆角没了。补齐这四个即可，取值与
          // theme.borderRadius 同源（都从 --radius 派生），不会两套。
          '--radius-sm': 'calc(var(--radius) - 4px)',
          '--radius-md': 'calc(var(--radius) - 2px)',
          '--radius-lg': 'var(--radius)',
          '--radius-xl': 'calc(var(--radius) + 4px)',
          '--font-size-base': fontSizeBase,
          // 真等宽的字栈也给一个变量：宿主 globals.css 与 Monaco 的 fontFamily option
          // 读它，别再各写一遍 'JetBrains Mono, SF Mono, …'
          '--font-code': fontFamily.code.join(', '),
          // 块级代码的字号与行高：Monaco 的 fontSize / lineHeight option 与 CodeBlock 的 CSS
          // 都读它，两块代码才是一套。不跟密度档缩放（代码是长时间盯着读的，字号是习惯不是版式）。
          '--code-font-size': '13px',
          '--code-line-height': '20px',
          ...cssVars(lightColors),
          ...cockpitVars(cockpitColors),
          ...topologyVars(topologyColors),
        },
        '.dark': {
          ...cssVars(darkColors),
          ...cockpitVars(darkCockpitColors),
          ...topologyVars(darkTopologyColors),
        },
        // 彩色主题（宿主打 `data-primary-tone=colored`）下浅色正文换柔和阶，
        // 值与理由见 colors.js 的 softText。`:not(.dark)`：暗色不动；子树里挂的
        // `.dark`（深色侧栏）会在自己元素上重声明 foreground，本来就不受这条影响。
        ':root[data-primary-tone=colored]:not(.dark)': cssVars(softText),
      })

      addBase({
        // `font-mono` = 机器串样式（见 design-tokens.js fontFamily 的注释）：字体仍是 Inter，
        // 这里补 Inter 的消歧特性。放 base 层而不是改工具类：工具类只出 font-family，
        // 这条只加 font-feature-settings，两者不打架。
        '.font-mono': { 'font-feature-settings': '"ss02", "zero", "tnum"' },
        // 真等宽关掉连字：日志里的 -> / != 连成一个字形会误导（看着像箭头，复制出来是两个字符）。
        // Monaco 自己默认也不开连字，这里让 LogViewer / YAML 文本域与之一致。
        '.font-code': { 'font-feature-settings': '"liga" 0, "calt" 0' },
        '*': { 'border-color': 'var(--border)' },
        body: {
          'background-color': 'var(--background)',
          color: 'var(--foreground)',
          'font-size': 'var(--font-size-base)',
        },
      })
    },
  ],
}

module.exports = localPreset
module.exports.default = localPreset
module.exports.edgePreset = localPreset
module.exports.buildSemanticColors = buildSemanticColors
