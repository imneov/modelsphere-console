// 可视化色板 —— 监控面板（cockpit）与拓扑图（topology）。
//
// ══════════════════════════════════════════════════════════════════════════════
// 2026-09-05 从 `@theriseunion/tokens` 搬进本仓（freeland#212）。
//
// ── 为什么单独一个文件，不并进 colors.js ──────────────────────────────────
// 格式不同：`colors.js` 是**语义 token**、HSL 通道值、经 `buildSemanticColors`
// 变成 Tailwind 颜色类；这两块是**hex 字面量**、只注入成 CSS 变量，消费方直接写
// `var(--cockpit-border)`，不走 Tailwind 颜色系统。混在一起会让"这个值该怎么用"
// 变得要看行号。
//
// ── 它们不是死代码（我一度判错）─────────────────────────────────────────
// 纳管时先按"0 处消费"打算删掉，是**错的**：实测全仓 cockpit 61 处 / 12 文件
// （`globals.css` 37 处 @utility + `components/cockpit/*` + 插件仓 nova-sync），
// topology 15 处 / 5 文件（`components/topology/*`）。
// 当时那次 grep 用了交替式模式，被 ugrep 包装吃掉、返回了假空。
// **教训：删东西之前的"零消费"证据，要用不依赖 grep 的方式复核一遍。**

/** 监控面板。浅色。 */
const cockpitColors = {
  bg: '#F8FAFC',
  bgSecondary: '#FFFFFF',
  bgTertiary: '#F9FAFB',
  bgElevated: '#FFFFFF',
  border: '#E2E8F0',
  borderSubtle: '#F1F5F9',
  borderHover: '#CBD5E1',
  text: '#1E293B',
  textSecondary: '#475569',
  textMuted: '#6B7280',
  accent: '#3B82F6',
  accentMuted: 'rgba(59, 130, 246, 0.1)',
  success: '#14B8A6',
  successMuted: 'rgba(20, 184, 166, 0.1)',
  warning: '#F59E0B',
  warningMuted: 'rgba(245, 158, 11, 0.1)',
  danger: '#EF4444',
  dangerMuted: 'rgba(239, 68, 68, 0.1)',
  purple: '#8B5CF6',
  purpleMuted: 'rgba(139, 92, 246, 0.1)',
}

const topologyColors = {
  bg: '#F5F7FA',
  cluster: '#2D3748',
  clusterForeground: '#FFFFFF',
  nodeGroup: '#10B981',
  nodeGroupForeground: '#FFFFFF',
  node: '#10B981',
  nodeForeground: '#065F46',
}

// ── 暗色对应 ──────────────────────────────────────────────────────────────
// preset 曾经只在 `:root` 注入这两族，`.dark` 里没有覆盖，于是暗色下监控面板与
// 拓扑图**纹丝不动** —— 那不只是"配色没跟上"：`cockpitColors.bg` 是近白、
// `text` 是近黑，不覆盖就意味着整个面板在暗色主题下是白底黑字。
//
// 三类值处理方式不同：
//   · 表面 / 文字 / 边框 —— 随主题反转，取值对齐 slate 家族与 surface scale 的暗色层次
//   · 强调色（accent/success/warning/danger/purple）—— 暗色**提亮一档**（500 → 400）。
//     暗背景上原色发闷，提亮才有同等视觉权重
//   · muted 变体 —— 不透明度 .1 → .15。10% 的色在暗底上几乎看不见

const darkCockpitColors = {
  bg: '#0F172A',
  bgSecondary: '#1E293B',
  bgTertiary: '#172033',
  bgElevated: '#1E293B',
  border: '#334155',
  borderSubtle: '#1E293B',
  borderHover: '#475569',
  text: '#F1F5F9',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  accent: '#60A5FA',
  accentMuted: 'rgba(96, 165, 250, 0.15)',
  success: '#2DD4BF',
  successMuted: 'rgba(45, 212, 191, 0.15)',
  warning: '#FBBF24',
  warningMuted: 'rgba(251, 191, 36, 0.15)',
  danger: '#F87171',
  dangerMuted: 'rgba(248, 113, 113, 0.15)',
  purple: '#A78BFA',
  purpleMuted: 'rgba(167, 139, 250, 0.15)',
}

const darkTopologyColors = {
  bg: '#0F172A',
  // 浅色下 cluster 是深灰底 + 白字；暗色下深灰会与背景糊在一起，故提亮到 slate-600。
  cluster: '#475569',
  clusterForeground: '#F1F5F9',
  // 节点在暗底上要"发光"：亮绿底 + 深绿字，与浅色 node 的（中绿底 + 深绿字）同构。
  nodeGroup: '#34D399',
  nodeGroupForeground: '#052E16',
  node: '#34D399',
  nodeForeground: '#052E16',
}

module.exports = {
  cockpitColors,
  darkCockpitColors,
  topologyColors,
  darkTopologyColors,
}
