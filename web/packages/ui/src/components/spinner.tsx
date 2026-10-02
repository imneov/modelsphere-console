"use client"

// 加载指示器 —— **全站唯一入口**。图案、尺寸、颜色都由这里统一。
//
// ══════════════════════════════════════════════════════════════════════════════
// 调用方只写 `<Spinner />` —— 图案由 `size` 与全局配置决定，不在每个调用点重选一次。
// 确实要定死某种时传 `variant`（仅 `lg` 生效，见下）。
//
// ── 六种图案 ──────────────────────────────────────────────────────────────
//   matrix  3×3 点阵呼吸，棋盘错相。**全站默认**（LF 2026-09-14 定：与
//           console-ui 统一观感，那边 Element Plus 的 v-loading 也换成了它）
//   ring    描边圆环。**唯一不重绘的一个** —— CSS transform 动画只在合成层跑
//   sweep   高光横扫过实心 logo
//   trace   空心细线沿轮廓跑
//   draw    实心从下往上长
//   aurora  两层反向流光在内部旋转，金属光泽
//
// 后四种都是 logo 动效，都不旋转 —— logo 是有方向的图形，转起来会读成
// 「图标歪了」而不是「在加载」。
//
// ── logo 动效只在页面级（lg）生效，其余尺寸回落成 ring ───────────────────
//
//   lg      页面级 / 整块加载（LoadingOverlay、带文案的加载块）→ 任意图案
//   md / sm 局部、行内（按钮里、表格行里）              → matrix / ring
//
// 两个理由指向同一个结论：
//   **看不清** 24px 以下 logo 那 60 段路径糊成一团，四种动效全都分辨不出
//   **不划算** logo 变体每帧都要按 60 段路径重新裁剪并重绘渐变/描边；
//              而小尺寸恰恰是「一屏几十个」的场景（表格每行、按钮内）
//
// 显式传 logo 动效也不例外 —— 那个尺寸下它只是白费重绘，看起来还都一样。
// `matrix` 与 `ring` 不在回落之列：一个是九个圆点、一个是一圈描边，
// 缩到 16px 照样读得出在动，重绘成本也只有九个圆。
//
// ── 要换东西时改哪里 ─────────────────────────────────────────────────────
//   换 logo          只改 BRAND_MARK（路径 + viewBox + trace 描边宽度）
//   全站改回圆环      DEFAULT_SPINNER_CONFIG.variant = "ring"
//   换一种品牌动效    同上，改 variant
//   某处要定死        调用点传 variant（仅 lg 生效）
//
// ── 动效为什么用 SVG 的 <animate> 而不是 CSS ─────────────────────────────
// 本包的 class 由**消费方的 Tailwind** 生成（design 不自带样式表）。自定义
// keyframes 要么进 preset、要么进各消费方 safelist —— 漏了不会报错，只是动画
// 静悄悄不存在（本仓踩过两次）。SVG 的 <animate> 不依赖任何 CSS。

import * as React from "react"
import { cn } from "../utils"
import { useUiT } from "../i18n/index"
import { BRAND_MARK } from "../icons/brand-mark"
import { useSpinnerConfig } from "./spinner-config"
import type { SpinnerSize, SpinnerVariant } from "./spinner-config"

export type { SpinnerSize, SpinnerVariant }


/** 扫光/填充要完全进出画面，两端各留一个身位。 */
const SWEEP_PAD = Math.round(BRAND_MARK.width * 0.62)

export interface SpinnerProps extends Omit<React.SVGProps<SVGSVGElement>, "role"> {
  /** 图案。不传则跟随偏好设置里的全局配置 */
  variant?: SpinnerVariant
  /** 尺寸档位。不传则跟随全局配置（默认 md） */
  size?: SpinnerSize
  /**
   * 可见文案。传了就渲染成「图案 + 文字」的竖排组合，不传只有图案。
   *
   * 整块加载用它 —— 文案说明在等什么，比一个孤零零的圈有信息量。
   */
  text?: string
  /** 屏幕阅读器朗读的文案。默认「加载中」。置空并配 `aria-hidden` 可作装饰用 */
  label?: string
  /** 外层容器类名（仅 `text` 存在时有意义） */
  wrapperClassName?: string
}

const SIZES = { sm: "size-4", md: "size-6", lg: "size-8" } as const

/**
 * 系统开了「减弱动效」就不播动画。
 *
 * SMIL 不受 CSS 的 prefers-reduced-motion 管，只能在这里判 —— 前庭功能障碍的
 * 用户看循环动画会真的不适，这不是可选项。
 */
function usePrefersReducedMotion(): boolean {
  const subscribe = React.useCallback((cb: () => void) => {
    if (typeof window === "undefined" || !window.matchMedia) return () => {}
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    mq.addEventListener("change", cb)
    return () => mq.removeEventListener("change", cb)
  }, [])
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    () => false, // SSR：按不减弱渲染，客户端接管后再纠正
  )
}

/**
 * 三个变体的根节点共用。**`pointer-events-none` 不是可选项**：
 *
 * SVG 的命中测试默认是 `visiblePainted` —— 只有被绘制到的像素才算命中。而这三个
 * 图案都在动（点阵的 `r` / `fill-opacity` 来回缩放、ring 在转），于是放进一个自带
 * 光标的可交互元素里时，指针会随动画节奏在「命中图形」和「命中底下的元素」之间
 * 来回切：表现就是**光标图标高频闪烁**（下拉加载态实测，LF 2026-09-17）。
 *
 * 语义上也该如此：`aria-hidden` / 只给 `aria-label` 的处理已经承认它是装饰不是内容，
 * 对读屏静音了，对鼠标也该静音。
 */
const SPINNER_ROOT = "pointer-events-none"

function SpinnerIcon({
  variant: variantProp,
  size: sizeProp,
  label,
  className,
  style,
  ...props
}: SpinnerProps) {
  const t = useUiT()
  const labelText = label === undefined ? t("spinner.loading") : label
  const cfg = useSpinnerConfig()
  const size = sizeProp ?? cfg.size
  // logo 动效只在 lg 生效 —— 见文件头。显式传也不例外，小尺寸一律回落。
  // matrix / ring 不回落：小尺寸下它们仍然读得出在动。
  const asked = variantProp ?? cfg.variant
  const variant: SpinnerVariant =
    size === "lg" || asked === "matrix" || asked === "ring" ? asked : "ring"
  const still = usePrefersReducedMotion()
  // 旋转中心 = 图形中心，随 BRAND_MARK 走
  const cx = BRAND_MARK.width / 2
  const cy = BRAND_MARK.height / 2

  // 一个页面可能同时挂多个，id 必须每实例唯一 —— 重了会互相引用错的渐变。
  const uid = React.useId().replace(/:/g, "")
  const clipId = `spinner-clip-${uid}`
  const gradId = `spinner-grad-${uid}`

  // 颜色：偏好选了具体色值就写 inline color；否则挂 `text-primary` ——
  // 加载动画跟着主题主色走（console-ui 那边的点阵也是主色），换主题一起换。
  // 用 class 而不是 inline color，是为了让调用方的 `className="text-destructive"`
  // 还能盖掉它：`cn` 走 tailwind-merge，同族后写的赢；inline 样式没这个余地。
  const styled = cfg.color ? { color: cfg.color, ...style } : style
  const tone = cfg.color ? undefined : "text-primary"

  if (variant === "matrix") {
    /*
      3×3 点阵呼吸 —— 搬自 console-ui 的 matrix-spinner（91×91 坐标系、r=13.5、
      两相位棋盘），观感逐点对齐，两边看起来是同一个加载动画。

      那边用 CSS @keyframes，这边只能用 SMIL：本包的 class 由**消费方的 Tailwind**
      生成，自定义 keyframes 要么进 preset、要么进各消费方 safelist —— 漏了不报错，
      动画静悄悄不存在（本仓踩过两次，见文件头）。

      缩放不走 transform 而是直接动 `r`：SVG 的 transform 原点默认在画布原点，
      要原地缩放得配 `transform-box: fill-box`，而那又是一条得靠 CSS 送达的规则，
      绕回同一个坑。动半径没有这个问题，视觉结果一样。

      相位差用 `begin="-0.6s"`（负偏移 = 从周期中段起播），对应那边的
      `animation-delay: -0.6s`。
    */
    const R = 13.5
    const MIN = R * 0.45
    const P = [13.5, 45.5, 77.5]
    const EASE = "0.4 0 0.2 1;0.4 0 0.2 1"
    return (
      <svg
        viewBox="0 0 91 91"
        role="status"
        aria-label={labelText || undefined}
        className={cn(SPINNER_ROOT, SIZES[size], tone, className)}
        style={styled}
        {...props}
      >
        {P.map((cyy, iy) =>
          P.map((cxx, ix) => {
            const delayed = (ix + iy) % 2 === 1
            return (
              <circle
                key={`${ix}-${iy}`}
                cx={cxx}
                cy={cyy}
                // 静止时停在两相位的中间态：整块点阵疏密有致，不会看成「九个一样的点」
                r={still ? (delayed ? MIN : R) : R}
                fill="currentColor"
                fillOpacity={still ? (delayed ? 0.25 : 1) : 1}
              >
                {!still && (
                  <>
                    <animate
                      attributeName="r"
                      values={`${MIN};${R};${MIN}`}
                      keyTimes="0;0.5;1"
                      calcMode="spline"
                      keySplines={EASE}
                      dur="1.2s"
                      begin={delayed ? "-0.6s" : "0s"}
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="fill-opacity"
                      values="0.25;1;0.25"
                      keyTimes="0;0.5;1"
                      calcMode="spline"
                      keySplines={EASE}
                      dur="1.2s"
                      begin={delayed ? "-0.6s" : "0s"}
                      repeatCount="indefinite"
                    />
                  </>
                )}
              </circle>
            )
          }),
        )}
      </svg>
    )
  }

  if (variant === "ring") {
    return (
      <span
        role="status"
        aria-label={labelText || undefined}
        style={styled}
        className={cn(
          SPINNER_ROOT,
          "inline-block animate-spin rounded-full border-2 border-current/25 border-t-current",
          SIZES[size],
          tone,
          className,
        )}
      />
    )
  }

  const shell = (children: React.ReactNode) => (
    <svg
      viewBox={`0 0 ${BRAND_MARK.width} ${BRAND_MARK.height}`}
      role="status"
      aria-label={labelText || undefined}
      className={cn(SPINNER_ROOT, SIZES[size], tone, className)}
      style={styled}
      {...props}
    >
      {children}
    </svg>
  )

  if (variant === "aurora") {
    return shell(
      <>
        <defs>
          <clipPath id={clipId}>
            <path d={BRAND_MARK.path} />
          </clipPath>
          {/*
            两层**反向**旋转的流光。单层只是「一条亮带在转」，两层反向叠加才会
            在交汇处忽明忽暗 —— 金属光泽感就来自这个干涉，不是来自颜色。
          */}
          <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={BRAND_MARK.width} y2="0">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="0.35" stopColor="currentColor" stopOpacity="0.45" />
            <stop offset="0.5" stopColor="currentColor" stopOpacity="1" />
            <stop offset="0.65" stopColor="currentColor" stopOpacity="0.45" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.18" />
            {!still && (
              <animateTransform
                attributeName="gradientTransform"
                type="rotate"
                values={`0 ${cx} ${cy};360 ${cx} ${cy}`}
                dur="3.2s"
                repeatCount="indefinite"
              />
            )}
          </linearGradient>
          <linearGradient id={`${gradId}-b`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={BRAND_MARK.width} y2="0">
            <stop offset="0" stopColor="currentColor" stopOpacity="0" />
            <stop offset="0.5" stopColor="currentColor" stopOpacity="0.55" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            {!still && (
              <animateTransform
                attributeName="gradientTransform"
                type="rotate"
                // 反向 + 不同周期：两层不会锁相，光影永远不重复
                values={`360 ${cx} ${cy};0 ${cx} ${cy}`}
                dur="5.1s"
                repeatCount="indefinite"
              />
            )}
          </linearGradient>
        </defs>
        {/* 底衬：暗处也不能塌成透明，否则转到背光角度时图形会缺一块 */}
        <path d={BRAND_MARK.path} fill="currentColor" fillOpacity="0.18" />
        <g clipPath={`url(#${clipId})`}>
          <rect width={BRAND_MARK.width} height={BRAND_MARK.height} fill={`url(#${gradId})`} />
          <rect width={BRAND_MARK.width} height={BRAND_MARK.height} fill={`url(#${gradId}-b)`} />
        </g>
      </>,
    )
  }

  if (variant === "draw") {
    return shell(
      <>
        <defs>
          <clipPath id={clipId}>
            <path d={BRAND_MARK.path} />
          </clipPath>
        </defs>
        {/*
          底衬：整只 logo 低透明度。**没填到的部分要能看见** —— 否则起笔前是一片
          空白，读起来像内容没加载出来，而不是正在加载。
        */}
        <path d={BRAND_MARK.path} fill="currentColor" fillOpacity="0.18" />
        {/*
          实心填充层：一块整幅矩形被 logo 裁出形状，靠 y 从下方推上来。
          用位移而不是改 height —— 改 height 时矩形顶边不动、底边往下长，
          看起来是「从上往下盖」；位移才是「从下往上填」。
        */}
        <g clipPath={`url(#${clipId})`}>
          <rect x="0" width={BRAND_MARK.width} height={BRAND_MARK.height} fill="currentColor" y={still ? 0 : BRAND_MARK.height}>
            {!still && (
              <animate
                attributeName="y"
                // 升起 → 停住 → 退回。退回而不是跳回，避免一帧突兀的闪断。
                values={`${BRAND_MARK.height};0;0;${BRAND_MARK.height}`}
                keyTimes="0;0.42;0.58;1"
                dur="2.4s"
                repeatCount="indefinite"
              />
            )}
          </rect>
        </g>
      </>,
    )
  }

  if (variant === "trace") {
    return shell(
      <>
        {/* 底衬轮廓：没有它，亮线跑到另一侧时这一段会完全消失，读起来像断线 */}
        <path
          d={BRAND_MARK.path}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth={BRAND_MARK.traceStroke}
          strokeLinejoin="round"
        />
        <path
          d={BRAND_MARK.path}
          fill="none"
          stroke="currentColor"
          strokeWidth={BRAND_MARK.traceStroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          // 声明长度为 100，下面的 dash 值即百分比
          pathLength={100}
          // 亮线占 22%，其余是空隙
          strokeDasharray="22 78"
          strokeDashoffset={still ? 0 : undefined}
        >
          {!still && (
            <animate
              attributeName="stroke-dashoffset"
              values="100;0"
              dur="1.6s"
              repeatCount="indefinite"
            />
          )}
        </path>
      </>,
    )
  }

  return shell(
    <>
      <defs>
        <clipPath id={clipId}>
          <path d={BRAND_MARK.path} />
        </clipPath>
        {/*
          扫光带。userSpaceOnUse 让 x1/x2 直接用 viewBox 坐标，动画才好算：
          两端各留 SWEEP_PAD 个身位，保证高光完全进场和完全离场。
        */}
        <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1={-SWEEP_PAD} y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.3" />
          <stop offset="0.5" stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.3" />
          {!still && (
            <>
              <animate attributeName="x1" values={`${-SWEEP_PAD};${BRAND_MARK.width}`} dur="1.4s" repeatCount="indefinite" />
              <animate attributeName="x2" values={`0;${BRAND_MARK.width + SWEEP_PAD}`} dur="1.4s" repeatCount="indefinite" />
            </>
          )}
        </linearGradient>
      </defs>

      {/*
        底衬：logo 本体，低透明度。没有它，高光扫出图形之外的瞬间整个 logo 会消失，
        看起来像闪烁而不是加载。
      */}
      <path d={BRAND_MARK.path} fill="currentColor" fillOpacity="0.25" />
      {/* 高光层：整块矩形被 logo 裁出形状，渐变在其中横扫 */}
      <rect width={BRAND_MARK.width} height={BRAND_MARK.height} fill={`url(#${gradId})`} clipPath={`url(#${clipId})`} />
    </>,
  )
}

/**
 * 加载指示器。图案、尺寸、颜色默认跟随偏好设置；传 `text` 则渲染成图案 + 文案。
 *
 * ```tsx
 * <Spinner />                          // 只有图案，跟随全局配置
 * <Spinner text="正在加载资源池..." />   // 图案 + 文案
 * <Spinner variant="aurora" size="lg" /> // 定死某种，忽略全局配置
 * ```
 */
export function Spinner({ text, wrapperClassName, label, ...props }: SpinnerProps) {
  if (!text) return <SpinnerIcon label={label} {...props} />

  return (
    // role=status 挂在外层：文案与图案合起来才是一个完整的加载态，
    // 图案单独朗读没有信息量（已 aria-hidden 静音）。
    <div
      role="status"
      className={cn("flex flex-col items-center justify-center gap-3", wrapperClassName)}
    >
      <SpinnerIcon label="" aria-hidden {...props} />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}
