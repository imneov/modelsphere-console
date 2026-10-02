"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { cn } from "../../utils"
import { CheckIcon, MinusIcon } from "lucide-react"

/**
 * ⚠️ 半选态的横杠图标是**本仓补的**，shadcn 生成的原版没有。
 *
 * Base UI 的 Indicator 在 checked **或** indeterminate 时都渲染，原版里面只有一个
 * CheckIcon —— 半选（列表全选框「选中了一部分」）会画成对钩，与全选态看不出区别。
 * 切 Base UI 前的 Radix 版本是分叉渲染的（`checked === "indeterminate" ? <Minus/> : <Check/>`），
 * 这里按 indeterminate 还原。`shadcn add checkbox` 会冲掉，重装后需补回。
 */
function Checkbox({
  className,
  indeterminate,
  ...props
}: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-input after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-disabled:cursor-not-allowed data-disabled:border-input data-disabled:data-checked:border-primary/30 data-disabled:data-checked:bg-primary/30 data-disabled:data-indeterminate:border-primary/30 data-disabled:data-indeterminate:bg-primary/30 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary dark:data-checked:bg-primary data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground dark:data-indeterminate:bg-primary",
        className
      )}
      indeterminate={indeterminate}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        {indeterminate ? <MinusIcon /> : <CheckIcon />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
