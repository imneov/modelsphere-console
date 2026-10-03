"use client"

// FieldRepeater —— 可增删的行列表（后端参数、LoRA 适配器、节点选择器…）。
//
// ══════════════════════════════════════════════════════════════════════════════
// 一行放什么由调用方给（`renderRow`）：可以是一个输入框、一个下拉 + 一个输入框、
// 或任意组合。组件只管这几件**每次都一样**的事：
//
//   · 行尾的减号（最后一行不给删）
//   · 底部的「添加 X」按钮
//   · **上一行没填完就不给添加**
//   · 空态给不给预留一行（`showEmptyRow`）
//
// ── 为什么要有它 ──────────────────────────────────────────────────────────
// 这四件事此前是每个调用点自己写的，于是同一个仓里出现过：能无限点出空行的、
// 删得只剩零行的、添加按钮有虚线和灰底两种样式的。它们都不报错，只是各长各的。
//
// `FieldKeyValue` 是本组件的一个**特例**（每行固定「键 : 值」两格 + 查重），
// 那些键值对独有的逻辑留在它自己那里，行列表这一层复用本组件。
//
// ── 装在哪 ────────────────────────────────────────────────────────────────
// 值是「一块」而不是「一行」，所以永远装在 `FloatingField layout="block"` 里：
//
//   <FloatingField layout="block" label="后端参数" hint="…">
//     <FieldBlock>
//       <FieldRepeater … />
//     </FieldBlock>
//   </FloatingField>

import * as React from "react"
import { Minus, Plus } from "lucide-react"
import { useFieldRequired } from "./floating-field"
import { cn } from "../utils"
import { useUiT } from "../i18n/index"
import { Button } from "./ui/button"

export interface FieldRepeaterProps<T> {
  /** 当前的行。 */
  value: T[]
  onChange: (value: T[]) => void
  /** 新增一行时的初始值。 */
  newItem: () => T
  /**
   * 渲染一行的内容（**不含**行尾的减号，那个由组件画）。
   *
   * `patch` 用来改这一行的值 —— 调用方不用自己算下标、不用自己复制数组。
   */
  renderRow: (item: T, index: number, patch: (next: T) => void) => React.ReactNode
  /**
   * 这一行算不算「填完了」。默认判非空字符串 / 非空对象。
   *
   * 只有最后一行填完了才允许再加 —— 与 `LabelEditor` 的 `handleAdd` 同一条规则
   * （`if (!newItem.key || !newItem.value) return`），只是把「点了没反应」换成
   * 「按钮置灰 + 说明原因」。
   */
  isComplete?: (item: T) => boolean
  /** 某一行的错误。有错的那一行也挡住「添加」。 */
  rowError?: (item: T, index: number) => string | null | undefined
  addButtonText?: string
  /**
   * 这个字段是不是必填。**它同时决定两件事，因为这两件事本来就是一回事**：
   *
   * | | `required`（必填） | 默认（选填） |
   * |---|---|---|
   * | 空态 | **摆一行**输入 | **只有一个添加按钮** |
   * | 最后一行 | **删不掉**（减号置灰） | **删得掉**，删完回到空态 |
   *
   * 必填意味着「零条」是非法状态，那界面就不该让用户走到那儿 —— 与其让他删空再
   * 用一条红字告诉他「至少要有一条」，不如一开始就不给删。反过来，选填的字段
   * **必须能删回零条**：用户加了一行又后悔，唯一的退路就是删掉它；把最后一行焊死，
   * 他只能留一行空的在那儿，提交时还得由调用方去过滤空行。
   *
   * （此前最后一行**恒**不可删，选填字段因此没有退路 —— 2026-09-04 修。）
   */
  required?: boolean
  /**
   * 空态时预留一行。**默认跟随 `required`** —— 必填就摆一行，选填就只留按钮。
   * 极少数「选填但多数人都会填」的字段才显式传 `true` 覆盖（省一次点击）。
   */
  showEmptyRow?: boolean
  /** 一条都没有时的提示。默认不显示：空态只有一个添加按钮，形态自解释。 */
  emptyText?: string
  disabled?: boolean
  className?: string
}

/** 默认的「填完了」判据：字符串非空；对象则要求每个字段都非空。 */
function defaultComplete(item: unknown): boolean {
  if (item == null) return false
  if (typeof item === "string") return item.trim() !== ""
  if (typeof item === "object") {
    const vals = Object.values(item as Record<string, unknown>)
    return vals.length > 0 && vals.every((v) => v != null && String(v).trim() !== "")
  }
  return true
}

export function FieldRepeater<T>({
  value,
  onChange,
  newItem,
  renderRow,
  isComplete = defaultComplete,
  rowError,
  addButtonText,
  required: requiredProp,
  showEmptyRow,
  emptyText,
  disabled = false,
  className,
}: FieldRepeaterProps<T>) {
  const t = useUiT()
  const resolvedAddButtonText = addButtonText === undefined ? t("shared.add") : addButtonText
  /**
   * 实际渲染的行。空态且 `showEmptyRow` 时摆一行**虚拟行** —— 它不在 `value` 里，
   * 用户一开始编辑才经 `patch` 落进去。受控组件在挂载时偷偷往 `onChange` 里塞
   * 初始值是很难查的一类 bug（调用方会发现「我传了空数组，一渲染就变成一条」，
   * 而且脏表单判定会一进来就说「已修改」）。
   */
  /**
   * 必填：**prop 优先，否则跟外层 `FloatingField` 的 `required` 走**。
   * 绝大多数调用点只在 `FloatingField` 上写一次 `required`，这里自动对齐。
   */
  const slotRequired = useFieldRequired()
  const required = requiredProp ?? slotRequired
  /** 空态摆不摆一行：默认跟随必填。 */
  const emptyRow = showEmptyRow ?? required

  const rows = value.length > 0 ? value : emptyRow ? [newItem()] : []

  /** 最少留几行。必填 = 1（删不到零），选填 = 0（能删回空态）。 */
  const minRows = required ? 1 : 0

  const patchAt = (index: number) => (next: T) => {
    if (value.length === 0) {
      onChange([next])
      return
    }
    onChange(value.map((item, i) => (i === index ? next : item)))
  }

  const last = rows[rows.length - 1]
  const lastErr = last !== undefined && rowError ? rowError(last, rows.length - 1) : null
  const canAdd = rows.length === 0 || (isComplete(last) && !lastErr)

  return (
    <div className={cn("grid gap-3", className)}>
      <div className="grid gap-3">
        {rows.length === 0 && emptyText ? (
          <p className="py-2 text-sm text-muted-foreground">{emptyText}</p>
        ) : null}
        {rows.map((item, index) => {
          const err = rowError?.(item, index)
          return (
            <div key={index}>
              {/* `items-start`：出错那一行下面会多一行红字，居中会把减号一起往下推 */}
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">{renderRow(item, index, patchAt(index))}</div>
                {/*
                  必填时最后一行不给删（`minRows = 1`）—— 零条对必填字段是非法状态，
                  与其让他删空再红字提示「至少要有一条」，不如一开始就不给删。
                  **选填时删得掉**：用户加了一行又后悔，唯一的退路就是删掉它。
                  圆形描边而不是 ghost：它是一个**破坏性动作**，需要一个明确的边界，
                  ghost 在一堆输入框旁边太容易被当成装饰。
                */}
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("shared.deleteRow")}
                  className="mt-3 rounded-full"
                  disabled={disabled || value.length === 0 || rows.length <= minRows}
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                >
                  <Minus className="size-4" />
                </Button>
              </div>
              {err ? (
                <p role="alert" className="mt-1 text-sm text-destructive">
                  {err}
                </p>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="grid gap-1.5">
        {/*
          灰底实心，不是虚线。虚线在这套语言里读作「占位待填」，而这是一个**明确的
          动作按钮** —— 它一直在那儿，也一直可点（填完上一行之后）。
        */}
        <Button
          variant="secondary"
          className="w-full"
          disabled={disabled || !canAdd}
          onClick={() => onChange([...(value.length ? value : []), newItem()])}
        >
          <Plus />
          {resolvedAddButtonText}
        </Button>
        {!disabled && !canAdd ? (
          <p className="text-sm text-muted-foreground">
            {lastErr ?? t("shared.completeRowFirst")}
          </p>
        ) : null}
      </div>
    </div>
  )
}
