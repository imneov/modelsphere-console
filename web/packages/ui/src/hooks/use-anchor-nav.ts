"use client"

// useAnchorNav —— 「一排锚点 + 纵向分组卡片」的滚动导航。
//
// ══════════════════════════════════════════════════════════════════════════════
// 用在**分组多但各填各的**长表单上：抽屉里一排锚点（SegmentedControl）+ 全部展开的
// 可折叠卡片。它替代 Tab —— Tab 的语义是互斥的几个视图，切过去另一个就看不见了；
// 而这些分组是**同一份配置**的几个部分，提交前用户要通读一遍确认。
//
// ── 抽成 hook 而不是各页抄一遍 ────────────────────────────────────────────
// 这套逻辑只有 ~60 行，但里面有四个**每次都会踩、且症状全都是"看着像坏了"**的坑。
// 抄第二遍必然漏掉其中一两个。四个坑逐一记在下面各自的实现处：
//
//   1. 容器节点要用 state 存，不能用 ref
//   2. 可见集合要自己维护，不能只看当次回调
//   3. 触底时规则反转
//   4. 必须补底部留白，否则"点了到顶"只是愿望
//
// ── 不做的事 ──────────────────────────────────────────────────────────────
// 不管**卡片怎么渲染**、不管**展开态存哪儿** —— 那些是调用方的事。
// 它只回答三件：现在在第几组、点了要跳到哪、尾巴要垫多高。

import * as React from "react"

export interface UseAnchorNavOptions {
  /** 分组 id 列表，**顺序即纵向顺序**。id 会用来查 `#${idPrefix}${id}` */
  ids: string[]
  /** DOM id 前缀。默认 `sec-`，避免和页面上其它 id 撞车 */
  idPrefix?: string
  /** 关掉时（如抽屉未打开）不建监听。默认 true */
  enabled?: boolean
  /**
   * 点锚点时展开对应分组。**给了就必须实现"确保展开"** ——
   * 收起状态下跳过去只看到一个标题条，会像功能坏了。
   */
  onExpand?: (id: string) => void
}

export interface UseAnchorNav {
  /** 挂到滚动容器上。**必须同时给它 `position: relative`**（见 go 的注释） */
  ref: (el: HTMLElement | null) => void
  /** 当前所在分组 id */
  active: string
  /** 跳到某组：展开 + 滚到容器顶部 */
  go: (id: string) => void
  /** 尾部留白高度，渲染成滚动容器最后一个子元素的 height */
  tailSpace: number
  /** 已经滚离顶部 —— 用来给固定的头部加投影，代替常驻分隔线 */
  scrolled: boolean
}

export function useAnchorNav({
  ids,
  idPrefix = "sec-",
  enabled = true,
  onExpand,
}: UseAnchorNavOptions): UseAnchorNav {
  /**
   * 坑 1：**容器节点用 state 存，不用 `useRef`。**
   *
   * 抽屉内容走 Portal 且带进场动画，节点**晚于 effect 才进 DOM** —— `useRef` 版本里
   * effect 跑到 `if (!root) return` 就退出了，观察器压根没建；而 effect 的依赖里没有
   * "节点出现"这件事，之后再也不会重跑，于是锚点永远停在第一项。
   * 回调 ref 写进 state，节点一挂上就触发重渲染，effect 拿到真节点再建。
   */
  const [root, setRoot] = React.useState<HTMLElement | null>(null)
  const [active, setActive] = React.useState(ids[0] ?? "")
  const [tailSpace, setTailSpace] = React.useState(0)
  const [scrolled, setScrolled] = React.useState(false)

  /** 点击后短暂锁住联动：平滑滚动要几百毫秒，这期间会一路扫过中间的分组 */
  const lockUntil = React.useRef(0)
  const [pending, setPending] = React.useState<string | null>(null)

  const idsKey = ids.join(",")

  const go = React.useCallback(
    (id: string) => {
      setActive(id)
      lockUntil.current = Date.now() + 700
      onExpand?.(id)
      setPending(id)
    },
    [onExpand]
  )

  /**
   * 展开会让内容长高，**同一个事件回调里 DOM 还是旧的**，此刻算出来的位置必然偏上
   * （表现是"点了只滚一半"）。所以记成 pending，等 React 把展开提交进 DOM 之后，
   * 在 layout effect 里再量再滚。
   */
  React.useLayoutEffect(() => {
    if (!pending || !root) return
    const el = root.querySelector<HTMLElement>(`#${idPrefix}${pending}`)
    if (el) {
      /**
       * 用 `offsetTop`，不用 rect 差值、更不用 `scrollIntoView`。
       *
       * rect 是**随当前滚动位置变化**的量：上一次平滑滚动还没停时基准一直在漂，
       * 算出来的目标就跟着偏，而且每次偏的量都不一样。`offsetTop` 是纯布局位置。
       * **前提是滚动容器必须是 `offsetParent`（给它 `position: relative`）**，
       * 否则会从更外层的定位祖先起算，凭空多出一个头部的高度。
       *
       * `scrollIntoView` 另有两个不确定：沿祖先链找可滚容器、把 `scroll-margin` 算进去。
       */
      root.scrollTo({ top: Math.max(0, el.offsetTop - 8), behavior: "smooth" })
    }
    setPending(null)
  }, [pending, root, idPrefix])

  React.useEffect(() => {
    if (!enabled || !root) return
    const list = idsKey ? idsKey.split(",") : []
    if (list.length === 0) return

    /**
     * 坑 2：**自己维护可见集合**，不能只看当次回调的 entries。
     * IntersectionObserver 每次只回传**状态发生变化**的那几个 —— 往下滚时一批里
     * 常常只有"刚离开激活区"的那一个，从中挑"最靠上的可见项"自然挑不到，高亮就卡住。
     *
     * 坑 3：**触底时规则反转，取最后一个可见项。**
     * 容器滚到底就再也滚不动了，最后那几个短分组永远进不了顶部激活区 ——
     * 只按"第一个可见"算的话，它们的锚点一辈子高亮不了。
     */
    const vis = new Map<string, boolean>()
    const pick = () => {
      if (Date.now() < lockUntil.current) return
      const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 2
      const seen = list.filter((id) => vis.get(id))
      const target = atBottom ? seen[seen.length - 1] : seen[0]
      if (target) setActive(target)
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) vis.set(e.target.id.slice(idPrefix.length), e.isIntersecting)
        pick()
      },
      // 下边收 72%：只把接近顶部的那一组算作当前，
      // 否则几张卡同时在视口里时会一直高亮最后一张
      { root, rootMargin: "0px 0px -72% 0px" }
    )
    for (const id of list) {
      const el = root.querySelector(`#${idPrefix}${id}`)
      if (el) io.observe(el)
    }

    // 触底判断必须挂在 scroll 上：撞到底之后 IntersectionObserver 不再有新回调，
    // 光靠它那条路径永远走不到"取最后一个"的分支
    const onScroll = () => {
      setScrolled(root.scrollTop > 4)
      pick()
    }
    root.addEventListener("scroll", onScroll, { passive: true })

    return () => {
      io.disconnect()
      root.removeEventListener("scroll", onScroll)
    }
  }, [enabled, root, idsKey, idPrefix])

  /**
   * 坑 4：**必须补底部留白**，否则"点锚点滚到顶"只是个愿望。
   *
   * 靠后的分组下面本来就没多少内容，浏览器把滚动量夹在最大值，卡片顶不上去 ——
   * 往内容里加东西也只是把问题往后挪一组。补一段留白，让最后一组下面也有整屏可滚。
   * 只需按最后一组算：它能到顶，前面的必然能。
   *
   * 留白本身不改 clientHeight、也不改最后一组的高度，所以不会自激循环。
   *
   * ── 但留白要有上限 ────────────────────────────────────────────────────
   * 补留白的前提是「最后一组要被顶到容器顶部」。**最后一组折叠时这个前提不成立** ——
   * 它本来就整个在视口里，不需要任何预留，此刻按公式算出来的却是「几乎一整屏」。
   *
   * 2026-09-03 团队反馈「留白很多」：创建推理服务的高级选项默认折叠后只有一行，
   * 于是抽屉下方挂着近一屏灰画布，看着像页面坏了。
   *
   * 所以按最后一组的**实际高度**判断：矮到能整个装进视口（不足半屏）就不补 ——
   * 它压根不需要滚动就能完整看到，补了纯属浪费。高到需要滚动才补。
   */
  React.useLayoutEffect(() => {
    if (!enabled || !root) return
    const list = idsKey ? idsKey.split(",") : []
    const lastId = list[list.length - 1]
    if (!lastId) return
    const last = root.querySelector<HTMLElement>(`#${idPrefix}${lastId}`)
    if (!last) return

    const measure = () => {
      const viewport = root.clientHeight
      const lastH = last.offsetHeight
      // 最后一组不足半屏 = 折叠着或本来就短，整个装得进视口，不需要预留
      if (lastH < viewport / 2) {
        setTailSpace(0)
        return
      }
      setTailSpace(Math.max(0, viewport - lastH - 12))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    ro.observe(last)
    return () => ro.disconnect()
  }, [enabled, root, idsKey, idPrefix])

  return { ref: setRoot, active, go, tailSpace, scrolled }
}
