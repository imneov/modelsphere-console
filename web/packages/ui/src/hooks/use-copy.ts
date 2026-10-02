"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * 复制到剪贴板 —— 带 HTTP 环境兜底与复制态状态机。
 *
 * **为什么必须兜底**：`navigator.clipboard` 只存在于安全上下文（HTTPS / localhost），
 * 而平台存在 HTTP 部署面（NodePort 直连）。直接调它在那些环境下是 `undefined`，
 * 复制静默失效甚至抛错 —— 与 SDK generateUUID 同一个坑。
 *
 * **为什么是 hook 而不是只有组件**：存在「要复制能力、但不要那个按钮」的场景 ——
 * 复制完弹 toast、行内文字变「已复制」、自带一套反馈 UI。这些场景只能手写
 * `navigator.clipboard`，于是全都漏掉了兜底。
 *
 * 状态在 1.5s 后自动回落 idle；组件卸载时清定时器。
 */
export type CopyState = "idle" | "copied" | "failed"

/** 复制文本。返回是否成功 —— 失败要给用户反馈，不能静默（freeland#69 A15）。 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 安全上下文里也可能被权限策略拒绝，落到下面的兜底
    }
  }
  if (typeof document === "undefined") return false
  // HTTP 兜底：隐藏 textarea + execCommand
  const ta = document.createElement("textarea")
  ta.value = text
  ta.style.position = "fixed"
  ta.style.opacity = "0"
  document.body.appendChild(ta)
  ta.select()
  try {
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    document.body.removeChild(ta)
  }
}

export interface UseCopyOptions {
  /** 复制态回落 idle 的毫秒数。默认 1500。 */
  resetAfter?: number
  /** 复制完成的回调（成功与否都会调），用于弹 toast 一类的自定义反馈。 */
  onCopied?: (ok: boolean) => void
}

export function useCopy({ resetAfter = 1500, onCopied }: UseCopyOptions = {}) {
  const [state, setState] = useState<CopyState>("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(
    async (text: string) => {
      const ok = await copyToClipboard(text)
      setState(ok ? "copied" : "failed")
      onCopied?.(ok)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setState("idle"), resetAfter)
      return ok
    },
    [resetAfter, onCopied]
  )

  return { copy, state, copied: state === "copied", failed: state === "failed" }
}
