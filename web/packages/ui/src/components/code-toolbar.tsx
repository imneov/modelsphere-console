"use client"

// CodeToolbar —— 代码块 / 编辑器右上角的浮动工具栏：复制、下载、上传。
//
// CodeEditor 与 CodeBlock 共用这一个：两块代码的右上角长得一样，用户不用分辨
// 「这块是编辑器还是只读块」就知道复制键在哪（freeland#352，LF 2026-09-11）。
//
// - 复制 / 下载 只读态、编辑态都有；上传只在编辑态（传了 onUpload 才出现），
//   上传 = 选一个文件，把内容整个替换进编辑器。
// - 始终可见，不做悬停出现：悬停出现在触屏上不可达。
// - ghost 图标钮，不带文字：这是控件自身的形态，不是「给动作配图」（PATTERNS 9.5）。
// - 位置由消费方摆（绝对定位在右上角，与滚动条错开）；本组件只管内容。

import * as React from "react"
import { Check, Copy, Download, Upload, X } from "lucide-react"
import { Button } from "./ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"
import { useCopy } from "../hooks/use-copy"
import { cn } from "../utils"
import { useUiT } from "../i18n/index"

export interface CodeToolbarProps {
  /** 当前内容：复制与下载的对象 */
  value: string
  /** 给了就显示「下载」，文件名用它 */
  downloadName?: string
  /** 给了就显示「上传」：读到文件文本后回调，由消费方写回编辑器 */
  onUpload?: (text: string, file: File) => void
  /** 上传接受的文件类型，默认按文本处理 */
  accept?: string
  className?: string
}

function downloadText(text: string, name: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function CodeToolbar({ value, downloadName, onUpload, accept, className }: CodeToolbarProps) {
  const t = useUiT()
  const { copy, state } = useCopy()
  const fileRef = React.useRef<HTMLInputElement>(null)

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // 同一个文件连选两次也要触发：清掉 input 的值
    e.target.value = ""
    if (!file) return
    file.text().then((text) => onUpload?.(text, file))
  }

  const item = (label: string, node: React.ReactNode) => (
    <Tooltip>
      <TooltipTrigger render={<span />}>{node}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )

  return (
    <div
      className={cn(
        // 只有图标，不描边不铺底（LF 2026-09-11：去掉边框保留 icon）—— 按钮自己的 hover 态就是反馈
        "inline-flex items-center gap-0.5",
        className,
      )}
      role="toolbar"
      aria-label={t("codeToolbar.label")}
    >
      {item(
        state === "copied" ? t("codeToolbar.copied") : state === "failed" ? t("shared.copyFailed") : t("shared.copy"),
        <Button variant="ghost" size="icon-xs" aria-label={t("shared.copy")} onClick={() => void copy(value)}>
          {state === "copied" ? <Check className="text-success" /> : state === "failed" ? <X className="text-destructive" /> : <Copy />}
        </Button>,
      )}
      {downloadName
        ? item(
            t("codeToolbar.download"),
            <Button variant="ghost" size="icon-xs" aria-label={t("codeToolbar.download")} onClick={() => downloadText(value, downloadName)}>
              <Download />
            </Button>,
          )
        : null}
      {onUpload
        ? item(
            t("codeToolbar.uploadTooltip"),
            <Button variant="ghost" size="icon-xs" aria-label={t("codeToolbar.upload")} onClick={() => fileRef.current?.click()}>
              <Upload />
            </Button>,
          )
        : null}
      {onUpload ? <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={pick} /> : null}
    </div>
  )
}
