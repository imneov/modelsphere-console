// 非颜色设计变量 —— 圆角 / 阴影 / 字族 / 动效。
//
// ══════════════════════════════════════════════════════════════════════════════
// 与 `colors.js`（色值真源）平级，一起构成 `design/tokens` 这个完整真源。
// 2026-09-05 从 `@theriseunion/tokens` 搬进来（freeland#212）——此前只接管了色值，
// 这些还从 npm 包流过来，等于真源分两处。
//
// ── 上游有、这里刻意不要的两项 ────────────────────────────────────────────
//
//   `zIndex` 语义档（z-modal / z-tooltip …）
//       Tailwind v4 **根本不生成它们** —— `@config` 兼容层不映射 v3 的 `theme.zIndex`
//       （实测：写了 `z-modal`，编译产物里没有这个类）。而全仓 0 处消费，
//       所以它死了都没人发现。要重做的话是 v4 的 `@theme` 变量，另开单。
//
//   `breakpoints`
//       v4 内建的 sm/md/lg/xl/2xl 已经生效（实测 `@media (width>=640px)` 正常）。
//       上游只把 2xl 从 1536 改成 1400，没有保留价值。
//
//   `spacing` / `duration` / `easing`
//       上游导出了但 preset 从没用过。间距在 v4 由 `--spacing` 单个杠杆驱动
//       （见 contract.ts 的密度档），不是一张静态表。

/**
 * 圆角档位。**全部绑 `--radius`** —— 那个变量由「圆角」偏好实时改，
 * 所以整站圆角跟着一个滑块走。
 */
const radius = {
  none: '0',
  sm: 'calc(var(--radius) - 4px)',
  md: 'calc(var(--radius) - 2px)',
  lg: 'var(--radius)',
  xl: 'calc(var(--radius) + 4px)',
  full: '9999px',
}

/** `--radius` 的出厂值。偏好里的圆角滑块以它为默认。 */
const radiusBase = '0.5rem'

/**
 * 阴影四档。
 *
 * ⚠️ **这几个值会覆盖 Tailwind v4 的内建同名档**，不是补充。
 * v4 的 `shadow-sm` 是两层（`0 1px 3px / 0 1px 2px -1px`），这里是一层更轻的
 * `0 1px 2px 0 rgb(0 0 0/.05)`。全仓 323 处在用，删掉会让整站阴影加重一档。
 */
const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  lg: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  xl: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
}

const SANS = [
  // 同理指向自托管的 Inter（--font-inter），而不是本机字体名
  'var(--font-inter, Inter)',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'Roboto',
  '"Helvetica Neue"',
  'Arial',
  'sans-serif',
  '"Apple Color Emoji"',
  '"Segoe UI Emoji"',
]

/**
 * 真等宽，**只给块级代码容器**：CodeEditor（Monaco）、LogViewer、YAML 文本域、
 * 「输入名称确认」的目标框。JetBrains Mono 本来就是为长时间读代码设计的，放在这些地方
 * 正合适；放进 14px 的表格 / 属性表就比旁边的 Inter 大一圈、黑一档 —— 这正是 2026-09-09
 * LF 指出的「页面很乱、有冲击」的来源。
 */
const CODE = [
  // 自托管的 JetBrains Mono（console/public/fonts，经 next/font/local 以 --font-jetbrains-mono
  // 暴露在 <html> 上）。此前字栈首位写的是本机字体名，只在装了它的开发机上生效，
  // 生产用户看到的其实是各自系统的等宽 —— 现在所有平台一致。变量缺失时（Storybook /
  // 未来迁回 rise-design-v3）退回本机同名字体，再退系统等宽。
  'var(--font-jetbrains-mono, "JetBrains Mono")',
  '"SF Mono"',
  'Monaco',
  '"Cascadia Code"',
  '"Fira Code"',
  'Consolas',
  '"Liberation Mono"',
  'monospace',
]

/**
 * ── 行内不再出现等宽字体（LF 2026-09-09 定，终态）────────────────────────────
 *
 * `font-mono` 保留这个类名，但**含义改为「机器串样式」**：仍是 Inter，只是开
 * Inter 自带的消歧特性（`ss02` 区分 I / l / 1、`zero` 斜杠零、`tnum` 等宽数字，
 * 在 preset 的 base 层给）。ID / hash / 镜像 / 路径 / 端点这类值需要的是「0 和 O 分得清、
 * 数字对得齐」，Inter 用特性就能给；「字符网格」那点好处在行内用不上 —— 表格里的 ID
 * 都被截断，真要核对靠复制按钮，不靠眼睛数字符。
 *
 * 为什么不改名成 font-machine：全仓 400+ 处 `font-mono` 散在 30 多个插件里，改名要
 * 全插件重建 + Chart bump；而 class 名只是 token 的键，改这里一处，所有插件经宿主
 * 编译立刻拿到终态。真等宽用新键 `code`，调用点只有设计系统内部四五处。
 *
 * 判据见 PATTERNS §5.4「机器串与等宽」。
 */
const fontFamily = {
  sans: SANS,
  mono: SANS,
  code: CODE,
}

/**
 * `--font-size-base` 的出厂值。
 *
 * ⚠️ 它**会被密度档覆盖**（`contract.ts` 的 `DENSITY`）—— 这里只是没设过密度时的兜底。
 * 改它不会改变任何一个已设密度的用户看到的字号。
 */
const fontSizeBase = '16px'

/**
 * 动效。`accordion-*` 是 shadcn Accordion 硬依赖的，删了组件展开会没有动画。
 *
 * ⚠️ `accordion-*` 用的是 `--radix-accordion-content-height`。本仓底座已切 Base UI
 * （#72），这个变量**现在由谁提供要复核** —— 原样搬进来是为了保持行为不变，
 * 不是认可它正确。
 */
const keyframes = {
  'accordion-down': {
    from: { height: '0' },
    to: { height: 'var(--radix-accordion-content-height)' },
  },
  'accordion-up': {
    from: { height: 'var(--radix-accordion-content-height)' },
    to: { height: '0' },
  },
  'ring-fill': { from: { strokeDashoffset: '251' } },
  'status-pulse': {
    '0%, 100%': { opacity: '1' },
    '50%': { opacity: '0.6' },
  },
  'count-fade-in': {
    from: { opacity: '0', transform: 'translateY(2px)' },
    to: { opacity: '1', transform: 'translateY(0)' },
  },
  'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
  'fade-out': { from: { opacity: '1' }, to: { opacity: '0' } },
  'slide-in-from-top': {
    from: { transform: 'translateY(-100%)' },
    to: { transform: 'translateY(0)' },
  },
  'slide-in-from-bottom': {
    from: { transform: 'translateY(100%)' },
    to: { transform: 'translateY(0)' },
  },
  'scale-in': {
    from: { opacity: '0', transform: 'scale(0.95)' },
    to: { opacity: '1', transform: 'scale(1)' },
  },
}

const animation = {
  'accordion-down': 'accordion-down 0.2s ease-out',
  'accordion-up': 'accordion-up 0.2s ease-out',
  'ring-fill': 'ring-fill 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards',
  'status-pulse': 'status-pulse 2s ease-in-out infinite',
  'count-fade-in': 'count-fade-in 0.3s ease-out',
  'fade-in': 'fade-in 0.2s ease-out',
  'fade-out': 'fade-out 0.2s ease-out',
  'slide-in-from-top': 'slide-in-from-top 0.2s ease-out',
  'slide-in-from-bottom': 'slide-in-from-bottom 0.2s ease-out',
  'scale-in': 'scale-in 0.2s ease-out',
}

module.exports = {
  radius,
  radiusBase,
  shadows,
  fontFamily,
  fontSizeBase,
  keyframes,
  animation,
}
