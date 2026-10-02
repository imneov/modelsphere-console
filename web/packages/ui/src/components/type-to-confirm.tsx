"use client"

// TypeToConfirm —— 「抄一遍才让你按」的确认闸门。
//
// ══════════════════════════════════════════════════════════════════════════════
// ── 为什么危险操作要打字 ──────────────────────────────────────────────────
// 弹窗按钮本身拦不住误删：危险按钮和普通按钮长得一样、位置固定，手比脑子快。
// 让用户**把目标抄一遍**才是真正的减速带 —— 它强迫眼睛离开按钮、回到对象上，
// 顺带确认「我选中的确实是这一条」。
//
// ── 单个和批量要抄的东西故意不一样（`defaultConfirmToken`）────────────────
//
//   **单个 → 抄该对象的标识**（名称 / id / uuid）。
//   这里的风险是**选错了对象**（点了相邻行、列表刚好刷新过），要核对的正是身份。
//
//   **批量 → 抄 `delete`**。批量的风险不是"选错哪一条"，而是**没意识到这是 10 条**；
//   而且逐条抄 10 个 uuid 没人会做，只会逼人去找绕过的办法。这里只需要一个
//   「我知道我在删东西」的动作，数量交给上面的清单去呈现。
//
// ── 为什么单独抽出来 ──────────────────────────────────────────────────────
// 这个能力本仓写过**三遍**：`NameConfirmDeleteDialog`（约 70 处调用）、
// `ConfirmDialog` 的 `confirmText`（文案还是英文的 "Type X to confirm"）、
// 以及后加的 `ConfirmDeleteDialog`。三份各自决定了字号、比对是否 trim、
// 要不要复制键、抄对了有没有反馈 —— 于是同一个平台里「删除」有三种手感。
//
// 现在三个弹窗都渲染本组件，实现只剩一份。改比对规则或视觉，改这里一处。
// （同一条约束见 `form.tsx` 文件头。）

import * as React from "react"
import { Check } from "lucide-react"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { CopyButton } from "./copy-button"
import { cn } from "../utils"
import { useUiT } from "../i18n/index"

/** 批量确认的固定词。单个用对象自己的标识。 */
export const BATCH_CONFIRM_TOKEN = "delete"

/**
 * 按数量给出该抄的串：**单个 = 它自己的标识，多个 = `delete`**。
 *
 * 列表展示的是显示名、而真正该核对的是 id / uuid 时，别用这个默认值，
 * 在调用点显式把 id 传给 `token`。
 */
export function defaultConfirmToken(identifiers: string[]): string {
  return identifiers.length === 1 ? (identifiers[0] ?? "") : BATCH_CONFIRM_TOKEN
}

/**
 * 判断是否抄对。**前后空白不算错** —— 从表格里复制标识常带一个尾随空格，
 * 为此卡住用户只会让人以为组件坏了。中间字符必须逐字相同。
 */
export function isConfirmMatched(typed: string, token: string): boolean {
  return typed.trim() === token
}

export interface TypeToConfirmProps {
  /** 要求抄写的串 */
  token: string
  value: string
  onValueChange: (v: string) => void
  /** 抄对且未 loading 时按回车触发 */
  onSubmit?: () => void
  disabled?: boolean
  /** 展示待抄的串（带复制键）。串已在别处展示时传 false，只留提示语与输入框。默认 true */
  showToken?: boolean
  /** 提示语。不传时取 ui 词表默认值：`showToken=false` 时为「请输入上方内容以确认」，否则「请输入下方内容以确认」 */
  label?: string
  /** 输入框占位符。不传时取 ui 词表默认值（`typeToConfirm.placeholder`） */
  placeholder?: string
  autoFocus?: boolean
  className?: string
}

export function TypeToConfirm({
  token,
  value,
  onValueChange,
  onSubmit,
  disabled = false,
  showToken = true,
  label,
  placeholder,
  autoFocus = true,
  className,
}: TypeToConfirmProps) {
  const t = useUiT()
  const inputId = React.useId()
  const matched = isConfirmMatched(value, token)
  const labelText = label === undefined ? t(showToken ? "typeToConfirm.labelBelow" : "typeToConfirm.labelAbove") : label
  const placeholderText = placeholder === undefined ? t("typeToConfirm.placeholder") : placeholder

  return (
    <div className={cn("space-y-2.5", className)}>
      <Label htmlFor={inputId} className="font-normal text-muted-foreground">
        {labelText}
      </Label>

      {/*
        待抄的串**单独占一行的展示块**，不与提示语内联。
        内联过一版：`请输入 ⟨token⟩ 以确认` —— uuid 有 36 个字符，一行放不下，
        于是折成「请输入」/「串」/「⧉ 以确认」三段，复制键被挤到下一行的行首，
        看着像和串没关系。串越长越乱，而这个组件的典型入参就是 uuid。

        块内左文右键：`items-stretch` + 一条竖分隔，让复制键的点击区是整条右侧，
        不是一个 14px 的小图标。
      */}
      {showToken && (
        <div className="flex items-stretch overflow-hidden rounded-lg border border-border bg-muted">
          <code className="min-w-0 flex-1 px-3 py-2 font-code text-[13px] leading-relaxed break-all text-foreground select-all">
            {token}
          </code>
          {/* uuid 逼人手打不是谨慎是刁难 —— 闸门的价值在"看清这是哪一个"，不在打字 */}
          <div className="flex items-center border-l border-border px-2.5 transition-colors hover:bg-foreground/[0.04]">
            <CopyButton text={token} aria-label={t("shared.copyToken", { token })} />
          </div>
        </div>
      )}

      <div className="relative">
        <Input
          id={inputId}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            // 抄对了就该能直接回车 —— 手已经在键盘上，还要摸鼠标很别扭
            if (e.key === "Enter" && matched && !disabled) {
              e.preventDefault()
              onSubmit?.()
            }
          }}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholderText}
          aria-label={t("typeToConfirm.inputLabel", { label: labelText, token })}
          className={cn("pr-8 font-mono", matched && "border-success")}
        />
        {/* 只在**抄对时**给反馈。没抄完不算错，中途标红会让人以为自己打错了 */}
        {matched && (
          <Check
            className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-success"
            aria-hidden
          />
        )}
      </div>
    </div>
  )
}
