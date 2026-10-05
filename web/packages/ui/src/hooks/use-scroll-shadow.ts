"use client"
// useScrollShadow —— 「我下面这层滚起来了没有」。
//
// ══════════════════════════════════════════════════════════════════════════════
// 给**滚动区上方的头部**用：未滚动时头部不画任何分隔，滚动之后补一道阴影，
// 表达「上面还压着一层，内容是从它下面过去的」。替代常驻的 `border-b` ——
// 那条线在没滚动时是多余的，它把「结构上有两块」画成了「视觉上有一条线」。
//
// ── ref 挂在滚动容器上，不是头部 ────────────────────────────────────────────
// 判据是滚动容器自己的 `scrollTop`，所以 ref 给它；`shadow` 给头部。两者是兄弟节点：
//
//   <div className="flex min-h-0 flex-col">
//     <div className={cn("shrink-0 …", shadow)}>头部</div>
//     <div ref={ref} className="min-h-0 flex-1 overflow-y-auto">内容</div>
//   </div>
//
// ── 与 PanelTabs 的 useStuck 不是一回事 ─────────────────────────────────────
// `useStuck` 服务的是 **sticky** 元素：它跟着内容一起滚，判据是「我的 top 顶到滚动
// 容器的 top 没有」。这里的头部是滚动容器的**兄弟**，本来就不动，顶不顶不成立，
// 判据只能是那一层滚没滚。两者共用同一个阴影值（`SCROLL_SHADOW_CLS`）。
import * as React from "react"

/**
 * 滚动阴影的唯一值。`PanelTabs` 与本 hook 共用 —— 同一件事只能有一个阴影。
 *
 * 负扩散 `-5px` 让阴影只在正下方糊出一小片、不往左右溢：头部通常通栏，
 * 溢出去会在相邻分栏的边界上留一道脏影。
 */
export const SCROLL_SHADOW_CLS = "shadow-[0_5px_10px_-5px_rgb(0_0_0/0.22)]"

export interface ScrollShadow<T extends HTMLElement> {
  /** 挂到**滚动容器**上。 */
  ref: React.RefObject<T | null>
  /** 该容器是否已经滚离顶部。 */
  scrolled: boolean
  /** 给头部的 class：已滚动时是 `SCROLL_SHADOW_CLS`，否则空串。 */
  shadow: string
}

/**
 * @example
 * ```tsx
 * const { ref, shadow } = useScrollShadow<HTMLDivElement>()
 * return (
 *   <div className="flex min-h-0 flex-col">
 *     <div className={cn("shrink-0 px-5 py-3 transition-shadow duration-200", shadow)}>…</div>
 *     <div ref={ref} className="min-h-0 flex-1 overflow-y-auto">…</div>
 *   </div>
 * )
 * ```
 * 头部自己要带 `transition-shadow duration-200`，否则阴影是硬切。
 */
export function useScrollShadow<T extends HTMLElement = HTMLDivElement>(
  /**
   * 滚动容器已经有 ref 时传进来（例如那一层还要做「回到顶部」）。
   * 省略则本 hook 自己建一个。传了就不要再合并 ref —— 一个元素挂两个 ref 是无谓的复杂。
   */
  externalRef?: React.RefObject<T | null>,
): ScrollShadow<T> {
  const ownRef = React.useRef<T>(null)
  const ref = externalRef ?? ownRef
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return

    // setState 传同值时 React 自己 bail out，不用手动去重
    const check = () => setScrolled(el.scrollTop > 0)
    check()

    el.addEventListener("scroll", check, { passive: true })
    // 内容变短到不再溢出时浏览器会把 scrollTop 夹回 0，但**不一定**发 scroll 事件
    // （列表换了一批数据就是这个场景）—— 阴影会留在那里，所以尺寸变化也要复核。
    const ro = new ResizeObserver(check)
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)

    return () => {
      el.removeEventListener("scroll", check)
      ro.disconnect()
    }
  }, [ref])

  return { ref, scrolled, shadow: scrolled ? SCROLL_SHADOW_CLS : "" }
}
