"use client"

// CopyButton —— 一键复制小按钮（复制成功切换 ✓ 反馈 1.5s，失败切 ✗）。
//
// 剪贴板逻辑与状态机在 `#hooks/use-copy` —— 本组件只是它的一层按钮 UI。
//
// **与 ValueText 的分工**：本组件用于「只要按钮、不显示值」的场景 —— 代码块右上角
// 的复制角标、工具栏按钮、复制一段不在页面上呈现的命令。要「值 + 复制」请用
// `ValueText copyable`，别用 `<ValueText showText={false}>` 那种写法（用 prop 关掉
// 组件主体是接口异味）。

import { Check, Copy, X } from "lucide-react"
import { useCopy } from "../hooks/use-copy"
import { cn } from "../utils"
import { useUiT } from "../i18n/index"

export interface CopyButtonProps {
  /** 要复制的文本 */
  text: string
  className?: string
  "aria-label"?: string
}

export function CopyButton({
  text,
  className,
  "aria-label": ariaLabel,
}: CopyButtonProps) {
  const t = useUiT()
  const { copy, state } = useCopy()
  const label = ariaLabel === undefined ? t("shared.copy") : ariaLabel

  return (
    <button
      type="button"
      onClick={(e) => {
        // 表格行常挂整行点击跳转，复制不应触发它
        e.stopPropagation()
        void copy(text)
      }}
      aria-label={label}
      title={state === "failed" ? t("shared.copyFailed") : undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-sm p-0.5",
        "text-muted-foreground transition-colors hover:text-foreground",
        "focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
    >
      {state === "copied" ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : state === "failed" ? (
        <X className="h-3.5 w-3.5 text-destructive" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  )
}
