"use client"

// 工具栏里的分隔线 —— 把「作用域」和普通筛选项分开的那一条。
//
// ── 为什么不是 Separator ─────────────────────────────────────────────────────
// `Separator` 的 vertical 档是 `self-stretch`：撑满 flex 行的高度。工具栏里控件是
// 32px、行本身还带换行间距，撑满会画出一条比控件还长的线。这里钉死 20px，与
// `h-8` 控件居中对齐后上下各留 6px。
//
// ── 它分的是两「类」，不是每一个控件 ────────────────────────────────────────
// 工具栏里的筛选分两类，这条线就是两类之间的界：
//
//   **作用域**    `WorkspaceSelect` / `ProjectSelect` / `ClusterSelect`
//                 回答「我在哪个范围里看」。永远有值，是上下文。
//   **普通筛选**  搜索框、状态、来源、环境…
//                 回答「再加什么条件」。可以全为空，空即不筛。
//
// 同一类内部**不画线**：工作空间与项目都是作用域，中间画一条就把一类切成两半了。
//
//   <WorkspaceSelect /> <ProjectSelect /> <FilterDivider /> <Input /> <FilterSelect />
//
// 所以线由调用方摆，不由作用域组件自己画 —— 组件自己画就没法知道后面还有没有同类。

import * as React from "react"
import { cn } from "../utils"

export interface FilterDividerProps extends React.ComponentProps<"span"> {
  className?: string
}

export function FilterDivider({ className, ...props }: FilterDividerProps) {
  return (
    <span
      aria-hidden
      className={cn("h-5 w-px shrink-0 self-center bg-border", className)}
      {...props}
    />
  )
}
