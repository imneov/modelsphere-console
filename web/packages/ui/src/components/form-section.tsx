"use client"

// filled 表单的分区 —— 一条浅色标题条，**不是卡壳**。
//
// ══════════════════════════════════════════════════════════════════════════════
// 现行形态用 `SectionCard`：一个带边框的卡片把整组字段裹起来。那在 label 在上、
// 控件是矮 `h-8` 的表单里是对的 —— 字段本身没有容器，需要卡片给它们一个边界。
//
// **filled 下不成立**：每个字段已经是一个带边框的圆角框，再套一层卡壳就是框中框，
// 两层圆角、两层边框，层级噪音比它划出的边界更贵。
//
// 所以分区退化成**一条标题条**：浅色底、圆角、可折叠。它只说「下面这几个框是一组」，
// 不再画边界 —— 边界由分组之间的间距表达。
//
// 结构：
//
//   ┌─────────────────────────────────────┐
//   │ ⌄  基本信息   决定哪些调用命中      │   ← 标题条（本组件）
//   └─────────────────────────────────────┘
//   ┌─────────────────────────────────────┐
//   │ 规则名称                            │   ← filled 字段，直接跟在下面
//   └─────────────────────────────────────┘
//
// ── 整条可点 ──────────────────────────────────────────────────────────────
// 折叠不是只有那个小箭头能点 —— 标题条整条都是热区（`SectionCard` 2026-09-03 也
// 刚这么改过）。箭头只有 16px，让人瞄准它是没必要的精细活。

import * as React from 'react'
import { cn } from "../utils"
import { ChevronDown } from "lucide-react"


export interface FormSectionProps {
  /** 锚点 id。`useAnchorNav` 靠它定位，值是 `idPrefix + id`。 */
  id?: string
  title: React.ReactNode
  /** 标题右边的一句话说明。不是必需的，能一句话说清才写。 */
  summary?: React.ReactNode
  /** 不传 = 不可折叠，标题条只是个分组标记。 */
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  children: React.ReactNode
  className?: string
}

export function FormSection({
  id,
  title,
  summary,
  expanded,
  onExpandedChange,
  children,
  className,
}: FormSectionProps) {
  const collapsible = expanded !== undefined && !!onExpandedChange
  const open = expanded !== false

  const header = (
    <>
      {collapsible ? (
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
            !open && '-rotate-90',
          )}
        />
      ) : null}
      <span className="text-sm font-medium text-foreground">{title}</span>
      {summary ? (
        <span className="truncate text-sm text-muted-foreground">{summary}</span>
      ) : null}
    </>
  )

  return (
    <section id={id} className={cn('space-y-3', className)}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => onExpandedChange!(!open)}
          aria-expanded={open}
          className={cn(
            'flex w-full cursor-pointer items-center gap-2 rounded-lg bg-muted px-4 py-2.5 text-left',
            'transition-colors hover:bg-muted/70',
          )}
        >
          {header}
        </button>
      ) : (
        <div className="flex w-full items-center gap-2 rounded-lg bg-muted px-4 py-2.5">
          {header}
        </div>
      )}
      {/*
        收起只藏不卸载：卸载会清掉里面所有字段的 state，再展开时已填的值和拉过的候选都没了。
        折叠是视图行为，不改变表单数据。
        用 `hidden` 属性而不是 `className="hidden"` —— 后者会被调用方传进来的 display 类盖掉。
      */}
      <div className="space-y-4" hidden={!open}>
        {children}
      </div>
    </section>
  )
}
