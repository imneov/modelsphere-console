"use client"

import * as React from "react"
import { cn } from "../utils"
import { useUiT } from "../i18n/index"

// SelectEmpty —— 下拉浮层里「一条都没有」时显示的那一块。
//
// ══════════════════════════════════════════════════════════════════════════════
// 抽出来的理由与 `SelectOptionContent` 同一条：`DataSelect` 有**两个引擎**
// （Base UI Select / Combobox），空态原本只有 Combobox 那条写了，Select 那条
// 直接 `options.map()` 没有兜底 —— 选项为空时浮层照常打开，里面是一个约 144px 宽、
// 8px 高的空白小方块（`min-w-36` + `p-1` + 边框阴影），不说明任何事。
// 而 `emptyText` 这个 prop 在 `DataSelect` 上声明了却只有 Combobox 读，
// 调用方传了以为生效、其实没有。
//
// ── 两种"空"是两件事 ──────────────────────────────────────────────────────
// **搜过但没匹配到**：下一步是改关键字，数据可能就在那儿。
// **列表本来就空**：下一步是去别处把数据建出来，改关键字没有任何用。
//
// 合并成一句「无匹配结果」会把第二种说错 —— 用户什么都没搜，却被告知没有匹配。
// 所以标题分两档，且**只有第二种才摆动作按钮**（搜不到时「去创建」是答非所问）。
//
// ── 动作为什么收 ReactNode 而不是 { label, onClick } ──────────────────────
// 业务形态差得远：有的跳转、有的开抽屉、有的要两个按钮。收结构化参数就得为每种
// 形态加一个字段，最后仍然要开一个逃生口。
//
// **点动作会先关浮层再执行** —— 调用方多半是跳转或开抽屉，不关的话抽屉会叠在
// 浮层上。调用方不要自己再关一遍。
export interface SelectEmptyProps {
  /**
   * 列表本来就空时的标题。**不传就用默认的「暂无可选项」；给了 `action` 时不传则整句省掉**
   * —— 按钮文案（「去镜像服务创建」）本身已经说明了这里是空的，上面再压一句
   * 「暂无可选项」是同一件事讲两遍。
   */
  title?: string
  /** 补一句为什么空 / 下一步做什么。 */
  description?: string
  /** 动作，通常是一个 `Button`。只在「列表本来就空」时渲染。 */
  action?: React.ReactNode
  /** 当前是不是「搜过但没匹配到」—— 是的话不摆动作。 */
  filtered?: boolean
  /** 关闭浮层。点动作时先调它。 */
  onDismiss?: () => void
  className?: string
}

export function SelectEmpty({
  title,
  description,
  action,
  filtered = false,
  onDismiss,
  className,
}: SelectEmptyProps) {
  const t = useUiT()
  const showAction = !!action && !filtered
  // 只有按钮、没人显式给标题时，不摆那句默认文案（见 `title` 的说明）
  const heading = title ?? (showAction ? undefined : t("selectEmpty.title"))
  return (
    <div
      data-slot="select-empty"
      className={cn(
        "px-2 text-center text-sm text-muted-foreground",
        // 一行字要上下留足（与原 Combobox 空态同口径）；有文字又有按钮时收紧一档，
        // 让两者读成一组；只有按钮时再收 —— 那时浮层里就一个控件，不该撑出一片空白
        !heading ? "py-2.5" : showAction ? "py-4" : "py-6",
        className,
      )}
    >
      {heading ? <p>{heading}</p> : null}
      {description ? <p className="mt-1 text-xs text-muted-foreground/80">{description}</p> : null}
      {showAction ? (
        <div
          className={cn("flex justify-center", heading && "mt-3")}
          // 浮层在 pointerdown 阶段就会关，按钮的 click 收不到 —— 在捕获阶段
          // 拦下这一段，自己决定「先关浮层、再执行调用方的 onClick」
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDismiss?.()}
        >
          {action}
        </div>
      ) : null}
    </div>
  )
}
