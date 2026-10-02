"use client"

// ⚠️ 本地改动（相对 shadcn 官方 base-nova）
// ─────────────────────────────────────────────────────────────────────────────
// 除下面这两处，本文件与官方注册表逐字节一致
// （可用 `node design/scripts/shadcn-diff.mjs select` 对账）：
//
// 1. **关掉 `alignItemWithTrigger`**（第 66 行起，那里有完整推导）。生成版默认 true，
//    行为是把「选中项的**文字**」对齐触发器文字；与下面第 2 条叠加后浮层会左偏约 32px。
// 2. **新增 `checkAlign`**（第 122 行起）—— 选中对钩放左还是放右。契约 freeland#33
//    当初定的是左；2026-09-06 LF 改回**右**（与 shadcn 官方一致），prop 保留给要放左的场合。
// 3. **对钩纵向居中**（`top-1/2 -translate-y-1/2`）。官方只给了 `absolute right-2`，
//    没有纵向定位，于是落在静态流的位置：单行选项看着正常，带副行的两行选项里明显偏上。
// 4. **选项行的呈现口径**（`List` 的 `p-1 gap-0.5`、`SelectItem` 的 `px-2 py-1.5 rounded-sm`、
//    选中 `data-selected:text-primary`）。官方把 `p-1` 挂在 `SelectGroup` 上，而绝大多数
//    调用点不分组 —— 于是行贴着弹层边缘、四角直角，与 Combobox 引擎、层级选择都不一样。
//    选中态官方只给一个对钩：一旦鼠标划过别行，"选的是哪个"就只能靠那个小钩找。
//    改成**选中只由对钩表达**：不改字色、不给底色（LF 2026-09-14 定死），与
//    `HierarchySelect` 逐字一致。选中行还要显式挡掉 `focus:bg-accent`：弹层一打开引擎
//    就把焦点落在选中项上，不挡就表现为「关掉再打开，选中那行凭空多出一块底色」。
//    高亮同理只换底色不换字色 —— 这一层的字色只剩正常与禁用两个含义。
//    行盒子（`items-start gap-2 cursor-pointer`）也与 Combobox 那条逐字对齐：
//    带图标 / 带副行时，两条路原来一个居中一个顶对齐、间距也差半格。
//    弹层外壳同理：官方是 `rounded-lg` + `ring-1`，本仓所有浮层（Combobox、层级面板、
//    Popover、Tooltip）都是 `rounded-md` + `border` —— 同一排下拉不该有两种壳。
//    底色只表示"鼠标/键盘现在指着谁"，选中是另一回事，两者不该抢同一个通道（LF 2026-09-14）。
//    `SelectGroup` 的 `p-1` 随之去掉，否则分组时内缩两层。
// 5. **`ItemText` 允许收缩**（`min-w-0 flex-1` 取代 `flex-1 shrink-0 whitespace-nowrap`）。
//    官方那组类让选项文字既不换行也不收缩：长标签 / 长副行直接**撑出弹层**，而不是
//    在 `SelectOptionContent` 里截断 —— 同一份数据在 Combobox 引擎里是省略号，在这里
//    是溢出，两个引擎显示不一致（LF 2026-09-14 截图）。
//
// 这两条曾是**互相牵连**的：对钩在左会把选项文字顶进去 32px，所以关掉了
// alignItemWithTrigger。默认改右之后那 32px 不存在了，但 alignItemWithTrigger 仍关着 ——
// 它对齐的是「选中项文字」而不是浮层本身，本仓的浮层要和触发器左缘对齐。改任何一条前先读另一条。
//
// 别把这些"修回"官方 —— 它们是有意的，而且盖掉之后只表现为"下拉浮层位置有点怪"，
// 极难联想到根因。

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "../../utils"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react"

const Select = SelectPrimitive.Root

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      // p-1 挪到 List 上（见文件头第 4 条）：不分组的调用点也要有内边距
      className={cn("scroll-my-1", className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-background py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none not-focus-within:hover:border-ring/40 focus-within:border-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignOffset = 0,
  // ── 本仓适配：关掉 alignItemWithTrigger（生成版默认 true）──────────────
  // 它的行为是把「**选中项的文字**」对齐到触发器文字，而不是浮层边框对齐触发器边框
  // （原生 macOS select 的观感）。这和本仓的另一处私货冲突：
  // 契约 freeland#33 规定对钩在**左**，于是选项文字被 pl-8 顶进去 32px；
  // 为了让那段被顶进去的文字对齐触发器，整个浮层会被**向左推约 32px** ——
  // 表现就是「下拉比输入框偏左一截」。
  // shadcn 官网看不出这个问题，是因为它的对钩在右、文字没有左缩进。
  //
  // 两个私货只能留一个。选择保契约（对钩在左）、关掉这个定位行为：
  // 筛选栏里的下拉是「工具栏控件」，边框对齐比「选中项浮在触发器上」更符合预期。
  alignItemWithTrigger = false,
  empty,
  ...props
}: { 
  /**
   * 列表为空时的那一块。**渲染在 `List` 外面** —— Base UI 的 List 是 listbox，
   * 里面只该有 `Select.Item`；塞一个普通 div 进去会参与它的选项注册与键盘导航。
   */
  empty?: React.ReactNode
} & SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn("relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
          {...props}
        >
          <SelectScrollUpButton />
          {empty}
          {/* p-1 + gap-0.5：行是圆角块，贴着弹层边缘或彼此贴着都读不出「这是几行」 */}
          <SelectPrimitive.List className="flex flex-col gap-0.5 p-1">{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

/**
 * 本仓私货：`checkAlign` —— 选中对钩的位置。
 * 默认 `right`（LF 2026-09-06，与 shadcn 官方一致；契约 freeland#33 原定的 left 作废）。
 * prop 保留，给确实要放左的场合。DataSelect / SelectCombobox 的默认值与这里同步。
 */
function SelectItem({
  className,
  children,
  checkAlign = "right",
  ...props
}: SelectPrimitive.Item.Props & { checkAlign?: "left" | "right" }) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-pointer items-start gap-2 rounded-sm py-1.5 text-sm outline-hidden select-none hover:bg-accent focus-visible:bg-accent data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        /*
          **选中只由对钩表达** —— 不改字色、不给底色（LF 2026-09-14 定死）。

          底色用 `hover` + `focus-visible`，**不用 `focus`**：弹层一打开，引擎就把焦点
          落在选中项上（键盘要从那儿接着走）。挂在 `focus` 上就等于「关掉再打开，
          选中那行凭空多出一块底色」。`focus-visible` 只在**键盘**开的弹层上命中，
          鼠标点开的不会 —— 正是想要的分工：

            鼠标点开 → 一行都不高亮；鼠标移到哪行（含选中行）哪行有底色
            键盘打开 → 当前键盘位置（初始即选中项）有底色，方向键走到哪儿跟到哪儿
        */
        checkAlign === "right" ? "pr-8 pl-2" : "pl-8 pr-2",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex min-w-0 flex-1 gap-2">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span
            className={cn(
              // top-1/2 + -translate-y-1/2：对钩是**整行的状态**，两行选项（标题 + 副行）
              // 里不该贴着首行。官方只给了 absolute + right-2，没有纵向定位，于是落在
              // 静态流的位置 —— 单行看着正常，两行就偏上（LF 2026-09-14）。
              "pointer-events-none absolute top-1/2 flex size-4 -translate-y-1/2 items-center justify-center",
              checkAlign === "right" ? "right-2" : "left-2"
            )}
          />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon
      />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon
      />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
