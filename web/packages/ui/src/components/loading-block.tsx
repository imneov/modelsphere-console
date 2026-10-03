"use client"

import { Spinner } from "./spinner"
import { cn } from "../utils"

/**
 * 占满容器、居中的整块加载态 —— **组合封装**：Spinner + 定位层。
 *
 * `Spinner` 只渲染一个 `size-8` 的 `<svg>`，**自己不负责居中**。整块等待
 * （路由守卫、Suspense fallback、整页 loading）必须包一层容器，否则图案贴在
 * 容器左上角。本组件就是那一层，调用方直接 `return <LoadingBlock />`。
 *
 * `h-full` 相对父级解析，**父级需有确定高度**；父级高度不定时传
 * `className="min-h-svh"` 一类覆盖。
 *
 * 内容已经在屏上、只是刷新 → 用 `LoadingOverlay`（absolute 遮罩，不顶掉内容）。
 * 图案 / 尺寸 / 颜色跟随偏好设置，此处不写死。
 */
export interface LoadingBlockProps {
  /** 图案下方的可见文案。不传则只有图案。 */
  text?: string
  /** 追加到容器上的类名，可覆盖高度与底色。 */
  className?: string
}

export function LoadingBlock({ text, className }: LoadingBlockProps) {
  return (
    <div className={cn("flex h-full w-full items-center justify-center bg-surface-page", className)}>
      <Spinner text={text} />
    </div>
  )
}
