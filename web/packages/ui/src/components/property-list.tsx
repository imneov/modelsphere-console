"use client"

import * as React from "react"
import { cn } from "../utils"

export interface PropertyItem {
  /** Property label (key) */
  label: string
  /** Property value — string or custom ReactNode */
  value: React.ReactNode
  /** 跨列数，1–4，默认 1。超出范围会被钳制到 4。 */
  span?: 1 | 2 | 3 | 4 | number
}

export type PropertyListVariant = "default" | "cell"

export interface PropertyListProps {
  /** Array of property items to display */
  items: PropertyItem[]
  /** Number of columns in the grid (1–4) */
  columns?: 1 | 2 | 3 | 4
  /**
   * `cell`：**表格单元格里的一组同级小数据**（「实例 1 / 副本 1」「显存 32GiB / 卡数 1」）。
   *
   * 与详情页那档的区别只有排版：**行内平铺**（`副本 2 · 显存 1 Gi` 一行放完，放不下才换行）、
   * 标签不带冒号、值用 `tabular-nums`。它解决的是一个角色问题 —— 两个同级信息此前各页手拼成
   * 「主行 sm + 副行 xs 灰」，把同级做成了主次（PATTERNS §5.4「标签 + 值」）。标签灰、值深、
   * **同字号同行**，才是「标签」和「值」的关系。
   *
   * 不竖着一项一行：单元格本来就只有两三行的高度预算，规格名 + 两个属性叠成三行
   * （LF 2026-09-09 实看否掉）。传了 `columns` 才切成等宽栅格。
   */
  variant?: PropertyListVariant
  /** Additional CSS classes for the grid container */
  className?: string
  /** CSS classes for individual label elements */
  labelClassName?: string
  /** CSS classes for individual value elements */
  valueClassName?: string
}

const columnClasses: Record<1 | 2 | 3 | 4, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
}

const spanClasses: Record<number, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
}

export function PropertyList({
  items,
  columns,
  variant = "default",
  className,
  labelClassName,
  valueClassName,
}: PropertyListProps) {
  const cell = variant === "cell"
  // cell 档不传 columns = 行内流式；传了才是栅格
  const flow = cell && columns === undefined
  const cols = columns ?? 3
  return (
    <div
      className={cn(
        "text-sm",
        flow ? "flex flex-wrap gap-x-2.5 gap-y-0" : "grid",
        !flow && (cell ? "gap-x-4 gap-y-0" : "gap-x-12 gap-y-3"),
        !flow && columnClasses[cols],
        className
      )}
    >
      {items.map((item, index) => (
        <div
          key={index}
          className={cn(
            "flex items-center min-w-0",
            flow && "shrink-0",
            item.span && item.span > 1
              ? spanClasses[Math.min(4, Math.floor(item.span)) as 2 | 3 | 4]
              : undefined
          )}
        >
          <span
            className={cn(
              "text-muted-foreground shrink-0 mr-2",
              labelClassName
            )}
          >
            {item.label}
            {!cell && ":"}
          </span>
          <span className={cn("text-foreground truncate", cell && "tabular-nums", valueClassName)}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  )
}
