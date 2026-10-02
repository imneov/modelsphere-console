/**
 * token 键 → Tailwind 颜色配置。
 *
 * **单独成文件、零依赖**（只依赖传入的 tokens 对象），因为有两个消费方：
 *
 *   1. `tailwind-preset.js` —— 真正拿它生成 theme.colors
 *   2. `scripts/undefined-token-lint.mjs` —— CI 的「引用了不存在的 token」检查
 *
 * 第 2 个是它必须独立的原因：lint-colors 这个 workflow **刻意不装依赖**
 * （见该 yml 的注释：「脚本只用 node 内置模块，不装依赖，所以这里不需要 pnpm」）。
 * 早先 lint 直接 require preset，而 preset 要 require `@theriseunion/tokens`
 * 取 cockpit/topology 色值 —— 在没有 node_modules 的 runner 上 MODULE_NOT_FOUND。
 *
 * lint 要验的恰恰是**「token 定义」到「Tailwind 能不能生成这个类」之间这一段**
 * （多段式键的折叠逻辑就在这里），所以不能改成让 lint 直接读 colors.js 绕过去 ——
 * 那就验不到这段了。抽出来共用，两个诉求都保住。
 *
 * 算法：两段式键（`primary-foreground`）折进分组对象，其余作扁平键。
 *
 * ⚠️ 值是 `var(--x)`，**不套 `hsl()`**（freeland#214）—— token 现在是 OKLCH
 * 字面量，本身就是合法颜色。透明度修饰符（`bg-primary/10`）照常工作：
 * Tailwind v4 用 `color-mix()` 注入 alpha，不需要 `<alpha-value>` 占位符。
 *
 * 三段式键（`sidebar-accent-foreground`）走 else 分支成为扁平键 —— 这是对的：
 * Tailwind 对带连字符的扁平键照样生成 `bg-sidebar-accent-foreground`。
 */
function buildSemanticColors(tokens) {
  const colors = {}
  const grouped = {}

  for (const key of Object.keys(tokens)) {
    const parts = key.split('-')
    if (parts.length === 2) {
      const [group, variant] = parts
      if (!grouped[group]) grouped[group] = {}
      grouped[group][variant] = `var(--${key})`
    } else {
      colors[key] = `var(--${key})`
    }
  }

  for (const [group, variants] of Object.entries(grouped)) {
    if (colors[group]) {
      colors[group] = { DEFAULT: colors[group], ...variants }
    } else {
      colors[group] = variants
    }
  }

  return colors
}

module.exports = { buildSemanticColors }
