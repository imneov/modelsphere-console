"use client"

import * as React from "react"
import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "../utils"
import { useUiT } from "../i18n/index"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"

export interface NumberFieldUnit {
  value: string
  label?: string
}

export interface NumberFieldProps
  extends Omit<React.ComponentPropsWithoutRef<"input">, "value" | "onChange" | "type"> {
  value: number
  onValueChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  /**
   * 小数位数。**不传 = 只收整数**（默认）。
   *
   * 传了之后同时管三件事，不用再各写各的：
   *   ① 输入时放行小数点  ② 显示保留几位  ③ 步进后按这个位数舍入
   *
   * 第三条是必需的：`0.1 + 0.2` 在浮点里是 `0.30000000000000004`，点两下加号
   * 就会把这串尾巴写进表单值、再原样提交给后端。
   *
   * `step` **不会**跟着自动变 —— 小数位数和步长是两件事（保留两位、每次跳 0.5
   * 是合理组合），要小步长就显式传 `step={0.1}`。
   */
  precision?: number
  /**
   * 单位候选。**传了就是「数量输入」，不传就是纯数字** —— 判据只有这一条。
   *
   * 多个 → 右侧出单位下拉；单个 → 右侧出纯文字（不给一个没得选的下拉）；
   * 不传 / 空数组 → 没有单位槽。
   */
  units?: readonly (string | NumberFieldUnit)[]
  /** 当前单位（受控）。 */
  unit?: string
  onUnitChange?: (unit: string) => void
  /**
   * 步进按钮什么时候出现。
   *
   * - `always`（默认）—— 常驻
   * - `focus` —— 聚焦时才淡入。**给 filled 表单用**：那种形态下框里平时只该有
   *   label 和值，一组常驻的箭头会把「这是个可以打字的输入框」这件事说小了
   * - `none` —— 不要步进，纯数字输入
   */
  steppers?: "always" | "focus" | "none"
  /** 外层框的类名。 */
  className?: string
  /** 输入框本身的类名（freeland#69 B9）。 */
  inputClassName?: string
  /**
   * 单位槽的类名。与 `inputClassName` 对称 —— 单位在组件内部，消费方够不到，
   * 但它经常需要跟着值一起排（filled 表单里值在框的下半部分，单位得跟着贴底，
   * 否则单位浮在框的垂直中心、值在下面，一个字段两个基线）。
   */
  unitClassName?: string
}

/**
 * 数字输入 —— 数值 + 右侧竖排步进器 +（可选）单位。
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ── 它同时是原来的 `QuantityInput` ────────────────────────────────────────
 * 两者曾是两个组件，差别名义上只有「有没有单位」，实际差的是**基座**：
 *
 *   | | 本组件（原 NumberField） | 原 QuantityInput |
 *   |---|---|---|
 *   | 基座 | Base UI `NumberField` 原语 | **手搓**（自管 draft / commit / clamp） |
 *   | 键盘 | 上下键、滚轮、scrub 拖拽 | 只有 ArrowUp / ArrowDown |
 *   | 无障碍 | `role=spinbutton` + aria-valuenow/min/max | 无 |
 *
 * 也就是说 `QuantityInput` 在**重新实现本组件已经从上游拿到的东西，而且更弱**。
 * #72 把本组件换成 Base UI 原语时它没跟上，于是同一个仓里「数字输入」有两套行为。
 * 合并不是为了省代码，是为了**消掉那份能力更差的重复实现** —— 对应 #72 的定调
 * 「base ui 就有这个能力，你就通过 base ui」。
 *
 * `QuantityInput` 作为 ADD-ONLY 别名保留（同 `Spinner` 合并 RingSpinner/LogoSpinner
 * 的先例，rise-global#234），调用点一行不用改。
 *
 * ── 步进器在右边，竖排 ───────────────────────────────────────────────────
 * 合并前两边形态不同：本组件是绝对定位在输入框**左右两侧**的 − / +，
 * `QuantityInput` 是**左侧一列** ∧ / ∨。必须统一，定案取右侧竖排：
 * 左侧那一列会把数值往右推，让同一列里带单位和不带单位的字段左边缘对不齐；
 * 左右两侧那对则会在窄框里压住数值本身。
 *
 * ── 契约（freeland#62）「编辑不拦、提交钳制」由原语保证 ──────────────────
 * 输入过程保留原始文本，blur / Enter 才格式化并钳制到 [min,max]。
 * `onValueChange` 的 null（清空态）不外传 —— 对外维持 `(value: number) => void`。
 */
function NumberField({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  precision,
  units,
  unit,
  onUnitChange,
  steppers = "always",
  disabled,
  className,
  inputClassName,
  unitClassName,
  ...props
}: NumberFieldProps) {
  const t = useUiT()
  const normalized = (units ?? []).map((u) =>
    typeof u === "string" ? { value: u, label: u } : { ...u, label: u.label ?? u.value }
  )

  /** 按 precision 收掉浮点尾巴。不传 precision 时不动值（由 format 保证是整数）。 */
  const round = (n: number) =>
    precision === undefined ? n : Number(n.toFixed(precision))

  return (
    <NumberFieldPrimitive.Root
      value={value}
      onValueChange={(v) => {
        if (v == null) return
        let next = v
        if (min !== undefined) next = Math.max(min, next)
        if (max !== undefined) next = Math.min(max, next)
        next = round(next)
        if (next !== value) onValueChange(next)
      }}
      min={min}
      max={max}
      step={step}
      // `useGrouping: false`：资源量不该出现千分位 —— 内存 `1,024 Mi` 读起来像两个数。
      // `maximumFractionDigits` 默认 0，所以**不传 precision 就是整数输入**，
      // 小数点会被原语直接吃掉，行为明确。
      format={{ maximumFractionDigits: precision ?? 0, useGrouping: false }}
      disabled={disabled}
      className={cn(
        // `flex w-full`：表单控件一律通栏，宽度由 Field / 栅格给（PATTERNS 3「控件宽度」）。
        // 底色与 Input / Textarea / SelectTrigger 完全一致：亮色 `bg-background`、
        // 暗色 `dark:bg-input/30`（PATTERNS 5.1 的 surface token 表末条）。
        // 圆角跟 `Input` 的 `rounded-lg` —— 合并前两边一个 md 一个 md，都比 Input 小一档。
        "group/number-field flex h-8 w-full items-stretch overflow-hidden rounded-lg border border-input bg-background text-sm transition-colors dark:bg-input/30",
        "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        "has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-3 has-[[aria-invalid=true]]:ring-destructive/20",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <NumberFieldPrimitive.Input
        className={cn(
          "min-w-0 flex-1 bg-transparent px-2.5 text-center tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
          inputClassName
        )}
        {...props}
      />

      {/* 单位槽。单个候选给纯文字 —— 一个没得选的下拉是在骗用户点。 */}
      {normalized.length > 1 ? (
        <Select
          value={unit}
          onValueChange={(v) => onUnitChange?.(v ?? "")}
          disabled={disabled}
        >
          <SelectTrigger
            className={cn(
              "h-full w-auto gap-1 rounded-none border-0 border-l border-input bg-transparent px-2.5",
              // ⚠️ `SelectTrigger` 把高度钉在 `data-[size=default]:h-8` 上 —— 带属性
              // 选择器的变体，**特异性压过 `h-full`，tailwind-merge 也不认为两者冲突**
              // （分属不同 group，不会消掉）。不写这一条，单位槽在高于 32px 的框里
              // 撑不满：分隔线只画一截、单位文字浮在半空（2026-09-03 实测，filled 的
              // 56px 框里最明显）。
              "data-[size=default]:h-full",
              "focus:ring-0 focus:ring-offset-0",
              unitClassName
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {normalized.map((u) => (
              <SelectItem key={u.value} value={u.value}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : normalized.length === 1 ? (
        <span
          className={cn(
            "flex items-center border-l border-input px-2.5 text-muted-foreground",
            unitClassName
          )}
        >
          {normalized[0].label}
        </span>
      ) : null}

      {/* 步进列：右侧竖排，∧ 在上 ∨ 在下。到界时由原语自动 disabled。 */}
      {steppers !== "none" ? (
        <div
          className={cn(
            "flex w-7 shrink-0 flex-col border-l border-input transition-opacity",
            // `focus` 档仍然**占位**（只改透明度，不 hidden）—— 否则箭头出现的瞬间
            // 输入框会被挤窄一截，光标跟着跳。
            steppers === "focus" &&
              "opacity-0 group-focus-within/number-field:opacity-100"
          )}
        >
          <NumberFieldPrimitive.Increment
            aria-label={t("numberField.increase")}
            tabIndex={-1}
            className="flex flex-1 items-center justify-center text-muted-foreground transition-colors enabled:hover:bg-muted enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronUp className="size-3" />
          </NumberFieldPrimitive.Increment>
          <NumberFieldPrimitive.Decrement
            aria-label={t("numberField.decrease")}
            tabIndex={-1}
            className="flex flex-1 items-center justify-center border-t border-input text-muted-foreground transition-colors enabled:hover:bg-muted enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronDown className="size-3" />
          </NumberFieldPrimitive.Decrement>
        </div>
      ) : null}
    </NumberFieldPrimitive.Root>
  )
}

export { NumberField }
