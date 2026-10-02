import * as React from "react"

import { cn } from "../../utils"

/**
 * 本仓适配：把**滚动容器**暴露出去（`containerRef` / `containerClassName`）。
 *
 * 生成版把 `<table>` 包在一个 `overflow-x-auto` 的 div 里，但不给外部任何句柄 ——
 * 于是消费方无法监听横向滚动，也无法给滚动条设样式。而横向滚动的可发现性
 * （「用户根本不知道右边还有列」）必须靠这两件事解决：滚动位置驱动的边缘阴影 +
 * 常显滚动条。className 落在 `<table>` 上，够不着容器。
 *
 * 上游没有这个口子，故在此补。改动只是转发两个可选属性，不动任何默认行为。
 *
 * 本仓适配二：`TableHead` 去掉上游的 `font-medium text-foreground`，改 `text-xs text-muted-foreground`
 * （辅助档 400，PATTERNS §5.4）。理由见 TableHead 处的注释；`shadcn add table` 会盖掉它。
 */
function Table({
  className,
  containerRef,
  containerClassName,
  ...props
}: React.ComponentProps<"table"> & {
  containerRef?: React.Ref<HTMLDivElement>
  containerClassName?: string
}) {
  return (
    <div
      ref={containerRef}
      data-slot="table-container"
      className={cn("relative w-full overflow-x-auto", containerClassName)}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        // ⚠️ 上游 shadcn 这里还有一条 `has-aria-expanded:bg-muted/50`，**已移除**：
        //
        // 1. `has-aria-expanded` 匹配的是属性**存在**，不是它的值 —— 行内只要有一个
        //    带 `aria-expanded` 的按钮（展开箭头就必须带，那是 disclosure 的 ARIA 契约），
        //    这行就永久灰底，跟展没展开无关。
        // 2. 它是**半透明**的 `/50`，而固定列靠 `bg-inherit` 取行背景 ——
        //    行背景一旦半透明，下层单元格的文字就会从固定列里透上来叠成一团。
        //    这是本文件 STICKY_CELL 那段反复强调的同一个坑。
        //
        // 行的展开态该由用它的组件自己决定要不要上色（ResourceTable 的结论是：不上色），
        // 不该由基类替所有人做主。
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        // 表头是「辅助」档：xs + 灰 + **400**（PATTERNS §5.4 角色表，LF 2026-09-08 试看、
        // 2026-09-09 去掉 font-medium）—— 表头说的是「这一列是什么」，要退到数据后面；
        // 正文 sm 主色留给单元格，**500 留给资源名**。表头也 500 时，名称只剩颜色能
        // 和表头分开，列表看着「一片同样重」。本仓适配：上游是 `font-medium`。
        "h-10 px-2 text-left align-middle text-xs whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
