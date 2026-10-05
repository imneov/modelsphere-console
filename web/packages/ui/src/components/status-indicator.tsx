import { cn } from "../utils"

/**
 * StatusIndicator —— 状态圆点（可带文字）。
 *
 * ── 为什么它不基于 Base UI ────────────────────────────────────────────────
 * Base UI 官网 37 个组件里没有 status / indicator / badge / dot / spinner，
 * 而且不该有：它卖的是**行为**（状态机、焦点管理、键盘、交互式 ARIA），本组件
 * 三样一样不占。反例 `Separator` 也零行为却被收录，因为它有个容易做错的平台契约
 * （role=separator + orientation）—— 所以真判据是「有没有难做对的 ARIA 契约」。
 * 本组件的那个契约见下方 a11y 注释，我们自己处理了。
 *
 * ── 档位设计：颜色 × 相位，两个正交维度 ──────────────────────────────────
 * `variant` 只管**颜色档**，`animated` 管**相位**（稳态 / 过渡态）：
 *
 *   稳态   运行中、已停止、失败      不会自己变，看一眼就走      → 静止
 *   过渡态 部署中、启动中、删除中     会自己变，用户在等          → 涟漪
 *
 * **稳态一律不动** —— 稳态动了就是噪音。附带好处：一屏里过渡态通常只有 1~3 个，
 * 动画数量天然被压住，不必担心几百行的表格。
 *
 * 刻意**不**把档位改成业务状态（`running`/`pending`/`deploying`）：那是把业务
 * 语义绑进设计系统，设计系统不该知道「部署中」是什么。
 */
export type StatusVariant = "success" | "warning" | "error" | "info" | "neutral" | "default"

export interface StatusIndicatorProps {
  /** 颜色档。`neutral` 已废弃，与 `default` 等价（freeland#69 B5） */
  variant?: StatusVariant
  /**
   * 是否为**过渡态**（进行中）—— 会渲染一圈向外扩散的涟漪。
   * 只给「会自己变、用户在等」的状态用；稳态传 false（默认）。
   */
  animated?: boolean
  /** 圆点尺寸 */
  size?: "sm" | "md" | "lg"
  /** 圆点右侧的文字 */
  label?: string
  /**
   * 读屏朗读的状态文案。不传 `label` 时**必须**给它，否则纯圆点对读屏完全静默
   * （freeland#69 A12）。传了 `label` 时默认取 `label`。
   */
  "aria-label"?: string
  className?: string
}

/**
 * 颜色档 → token。
 *
 * 全部走语义 token，不再是 `bg-green-500` 那样的写死色板 —— 写死的色板不跟主题、
 * 不跟暗色，而且「成功=什么绿」要改就得翻遍每个组件。
 * `error` 复用 `destructive`：站内只该有一个「错误红」。
 */
const VARIANT_TOKEN: Record<StatusVariant, { dot: string; aura: string }> = {
  success: { dot: "bg-success", aura: "ring-success/20" },
  warning: { dot: "bg-warning", aura: "ring-warning/20" },
  error: { dot: "bg-destructive", aura: "ring-destructive/20" },
  info: { dot: "bg-info", aura: "ring-info/20" },
  /** @deprecated 用 `default`，两者等价 */
  neutral: { dot: "bg-muted-foreground", aura: "ring-muted-foreground/20" },
  default: { dot: "bg-muted-foreground", aura: "ring-muted-foreground/20" },
}

const SIZE: Record<"sm" | "md" | "lg", { dot: string; aura: string }> = {
  // aura = 同色低透明的细环，稳态也有，给圆点一点厚度 —— 纯色实心点没有任何
  // 厚度，是原先「看着廉价」的主因。
  //
  // 用 `ring-*` 而不是"在底下垫一层放大的实心圆"：垫层做出来是**同心靶环**
  // （一个 8px 实心点 + 一个 16px 的 15% 圆＝两个圆），而 ring 是紧贴边缘向外
  // 的一圈薄环，读起来才是氛围。环宽刻意压到 2~3px：光晕直径一旦超过圆点直径，
  // 视觉重心就从点移到晕上了。
  //
  // （ring 的颜色能取到 token —— `ring-success/20` 产出
  //  `color-mix(in oklab, var(--success) 20%, transparent)`，实测确认。）
  sm: { dot: "h-1.5 w-1.5", aura: "ring-2" },
  md: { dot: "h-2 w-2", aura: "ring-[3px]" },
  lg: { dot: "h-2.5 w-2.5", aura: "ring-[3px]" },
}

export function StatusIndicator({
  variant = "default",
  animated = false,
  size = "md",
  label,
  className,
  "aria-label": ariaLabel,
}: StatusIndicatorProps) {
  const tone = VARIANT_TOKEN[variant]
  const { dot, aura } = SIZE[size]

  const a11yLabel = ariaLabel ?? label

  return (
    <div
      // gap-2.5 而非 gap-2：光晕向外占了 3px，不补回去看着挤
      className={cn("flex items-center gap-2.5", className)}
      // 用 role="img" 而非语义上更贴的 role="status"（= aria-live=polite）。
      // **这是有意的，别"修正"它**：live region 会在内容变化时自动播报，而本组件
      // 最主要的落点是表格单元格 —— 几百行各挂一个 live region，任何一次列表刷新
      // 读屏就开始念一长串。真正需要播报「部署中 → 运行中」的是详情页，那是页面
      // 级的职责，不该压给这个原子。
      role={a11yLabel ? "img" : undefined}
      aria-label={a11yLabel}
    >
      <span className={cn("relative flex shrink-0", dot)} aria-hidden>
        {animated && (
          // 涟漪层：以圆点为原点向外扩散并淡出。absolute 不占布局，
          // 否则过渡态的行高会比稳态高一截。
          <span className={cn("absolute inset-0 rounded-full", tone.dot, "animate-status-halo")} />
        )}
        <span
          className={cn(
            "relative inline-flex rounded-full",
            dot,
            tone.dot,
            aura,
            tone.aura,
            // 过渡态额外让圆点本身轻微呼吸，与涟漪一起读作「在动」。
            // 复用 tokens 里早就有的 status-pulse（opacity 1↔0.6）——
            // 它在上游 motion.ts 和 console 的 globals.css 各有一份，
            // 零消费者。同一个想法有人试过两次没做完，这次给它接上。
            animated && "animate-status-pulse"
          )}
        />
      </span>
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}
