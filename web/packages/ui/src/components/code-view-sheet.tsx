"use client"
/**
 * 只读代码抽屉：详情页里「查看 YAML / 查看某一项的原文」统一走它（PATTERNS 4.1）。
 *
 * 为什么是抽屉而不是行内展开 / Dialog：
 * - 行内展开把一份几百行的 YAML 塞进表格中间，表格被撑成一屏，上下两行对不上；
 *   而且每张表都得自己维护 expanded 状态与跨列的那一行（model-x 两个 Tab 各写了一份）。
 * - Dialog 是「一个决定」的形态（4.1），看 YAML 不是决定，是阅读；阅读要高度。
 * - 抽屉从右侧盖住一半，左边的表还在，看完关掉回到原位 —— 与「新增 / 编辑表单」同一个心智。
 *
 * 骨架照 4.9：`gap-0`，header 固定，body 滚，footer 固定。宽度 `2xl`（4.3：可编辑 / 可读的 YAML 是按列算宽度的
 * 内容，与栏数无关；`lg` 档已退役）。
 * 只读：要改就用各自表单抽屉的 YAML 模式，本组件不接 onChange。
 *
 * ModelSphere 本地改动：正文用 CodeBlock 而非 Monaco 的 CodeEditor —— Monaco 要从外网加载，且只读查看不需要它。
 */
import * as React from "react"
import { Button } from "./ui/button"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet"
import { CodeBlock } from "./code-block"
import { useUiT } from "../i18n/index"

export interface CodeViewSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 看的是什么：如「Deployment · infer-qwen-engine」「版本快照 v3」 */
  title: React.ReactNode
  description?: React.ReactNode
  value: string
  /** 默认 yaml */
  language?: string
  /** 给了就显示「下载」，文件名用它 */
  downloadName?: string
}

export function CodeViewSheet({
  open,
  onOpenChange,
  title,
  description,
  value,
  language = "yaml",
  downloadName,
}: CodeViewSheetProps) {
  const t = useUiT()
  // 只读查看，关掉不丢任何东西 —— 走 dismissible，四个出口都直接关
  return (
    <Sheet open={open} onOpenChange={onOpenChange} dismissible>
      <SheetContent size="2xl" className="gap-0">
        <SheetHeader className="border-b border-border px-5 py-3.5">
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        {/*
          正文 = **灰底画布 + 白色代码卡**，与页面「灰底画布上浮白卡」同一套（§2）。
          `--popover` 是纯白，不给画布底色的话正文和编辑器都是白的，糊成一片、看不出
          代码是一块独立内容（2026-09-01 LF 对着 demo 的 YAML 抽屉指出）。
          内边距用抽屉骨架的标准值 px-5 py-4（4.9）。
        */}
        <SheetBody className="flex min-h-0 flex-1 flex-col bg-surface-page px-5 py-4">
          {/* 复制 / 下载在编辑器右上角的 CodeToolbar 里（freeland#352），footer 只剩关闭 */}
          <CodeBlock language={language} value={value} lineNumbers maxHeight="none" className="min-h-0 flex-1 overflow-auto" downloadName={downloadName} />
        </SheetBody>
        <SheetFooter className="flex-row justify-end border-t border-border">
          <Button onClick={() => onOpenChange(false)}>{t("shared.close")}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
