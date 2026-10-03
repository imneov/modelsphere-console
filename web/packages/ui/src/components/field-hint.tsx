"use client"

// FieldHint —— 表单字段的「?」说明。
//
// ══════════════════════════════════════════════════════════════════════════════
// 领域概念必须**就近解释**。`rank` / `alpha` / 「存储类型」这些词，用户不查文档
// 就不知道填什么；而让用户去查文档，等于没有文档 —— 他会随便填一个然后来问你。
//
// ── 放哪儿：有 label 就贴 label，没 label 就贴控件 ──────────────────────────
// 提示是对**这个字段**的解释，所以它要贴着这个字段的"名字"。
// label 就是名字；没有 label 时（工具栏里的裸输入框、表格里的内联编辑），
// 控件本身就是名字，那就贴控件右边。
//
//   有 label：  展示名 ⓘ
//              [ 客服话术 v5              ]
//
//   无 label：  [ 搜索模型名称 / AI 路由   ] ⓘ
//
// ── 为什么不用 FieldDescription 代替 ──────────────────────────────────────
// 两者分工不同，别混：
//   `FieldDescription` —— **每次都要看**的信息（「创建后不可修改」「留空自动回填」），
//                         常驻在控件下方，不需要用户主动去够。
//   `FieldHint`（本组件）—— **只在不懂时才看**的解释（rank 是什么、LoRA 与全量的区别），
//                         收进图标里，不占版面、不制造噪音。
// 判据：这句话是不是**每个人每次填都该读一遍**？是 → Description；否 → Hint。
//
// ── 为什么不用 `title` 属性 ───────────────────────────────────────────────
// 原生 `title` 延迟约 1 秒、样式不可控、移动端和键盘完全够不着，且长文案会被
// 系统截断。用 Tooltip 才有可控的延迟、排版和无障碍。

import * as React from "react"
import { CircleHelp } from "lucide-react"
import { cn } from "../utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"
import { useUiT } from "../i18n/index"

export interface FieldHintProps {
  /** 提示内容。一两句话说清「这是什么、该填什么」，长了就该进文档 */
  children: React.ReactNode
  /**
   * 无障碍标签。默认取 `fieldHint.label`。
   *
   * 图标本身对读屏是静默的，不给它一个名字，键盘用户 Tab 到这里只会听到"按钮"。
   */
  label?: string
  className?: string
}

export function FieldHint({ children, label, className }: FieldHintProps) {
  const t = useUiT()
  const labelText = label === undefined ? t("fieldHint.label") : label
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          // 用 <button> 而不是 <span>：**键盘要够得着**。
          // span 不在 Tab 序列里，只能悬停触发，等于把这段解释藏起来只给鼠标用户。
          <button
            type="button"
            aria-label={labelText}
            // 不是提交按钮，也不该跟着表单的 disabled 走 —— 表单只读时更需要看解释
            className={cn(
              "inline-flex shrink-0 cursor-help align-middle text-muted-foreground/70",
              // 悬停染主色：与 Tabs / outline 按钮同一条口径（PATTERNS「交互态也染主色」）。
            // 用 `enabled:` 限定 —— 规范要求悬停态必须限定，否则禁用元素也会跟着变色。
            "transition-colors enabled:hover:text-primary",
              "focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              className
            )}
          />
        }
      >
        {/* size-3.5：比正文小一档。它是补充信息，抢过标题的注意力就本末倒置了 */}
        <CircleHelp className="size-3.5" />
      </TooltipTrigger>
      {/*
        max-w 限宽：不限的话一长句会拉成横贯全屏的一行，反而更难读。
        再套一层 block：`TooltipContent` 自己是 `inline-flex items-center`，
        直接塞两段进去会被排成**并排的两列**（静默，不报错）。
      */}
      <TooltipContent className="max-w-64">
        <span className="block">{children}</span>
      </TooltipContent>
    </Tooltip>
  )
}
