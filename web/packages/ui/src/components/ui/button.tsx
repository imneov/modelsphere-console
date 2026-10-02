// ⚠️ 本地改动（相对 shadcn 官方 base-nova）—— 用 `shadcn-diff` 脚本对账
// ─────────────────────────────────────────────────────────────────────────────
// 1. **禁用态 `pointer-events-none` → `cursor-not-allowed`**，并把所有 `hover:`
//    限定到 `enabled:hover:`。
//
//    官方用 `disabled:pointer-events-none`，那会让元素**不接收任何鼠标事件** ——
//    于是 `cursor-not-allowed` 永远不生效（光标落在按钮上仍是普通箭头），
//    挂在禁用按钮上的 tooltip 也永远弹不出来。
//
//    这是个**静默**问题：`disabled:cursor-not-allowed` 照常写进 class、CSS 照常
//    生成、浏览器不报错，只是没有任何效果。本仓实测：17 个文件写了
//    `pointer-events-none`，12 个写了 `cursor-not-allowed`，**其中 6 个两者都写** ——
//    那 6 处的 `cursor-not-allowed` 全是死代码，有人想做但被抵消了。
//
//    去掉之后禁用按钮会开始接收 hover，所以每个 `hover:` 都要限定成
//    `enabled:hover:`，否则它会变色、看起来还能点。
//
//    ⚠️ 功能上是安全的：原生 `<button disabled>` 本来就不触发 click，
//    `pointer-events-none` 在这里只是"顺带"挡住了光标与 tooltip。
//
//    规则见 `design/PATTERNS.md` 5「不可点击的两种状态」。
//
// 2. **`secondary` 的 hover 混入比例从 5% 提到 8%**：灰阶归 neutral 之后，
//    5% 在浅灰底上几乎看不出来。
//
//    ── 这里曾经有个更严重的问题，已随格式换代消失（freeland#206 / #214）──
//    token 当年存的是 **HSL 通道值**（`0 0% 96%`），而官方生成件写的是
//    `color-mix(in oklch, var(--secondary), …)` —— `var()` 展开成一串裸数字，
//    不是合法颜色，**整条 background 声明失效**：鼠标移上去背景整块消失
//    （不是变色，是没了），CSS 照常生成、浏览器不报错，又一个静默失效。
//
//    当时的修法是套一层 `hsl()`，那是在给格式打补丁。#214 把整套 token 切成
//    OKLCH 之后 `var(--x)` 本身就是合法颜色，**补丁已撤除，写法回到官方原样**。

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground enabled:hover:bg-primary/80",
        outline:
          "border-border bg-background enabled:hover:bg-muted enabled:hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground enabled:hover:bg-[color-mix(in_oklab,var(--secondary)_92%,var(--foreground))] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "enabled:hover:bg-muted enabled:hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive enabled:hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 enabled:hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      // 本地改动 2：暴露 data-variant。彩色主题下 outline / secondary 的悬停态要染主色，
      // 那条规则在宿主 globals.css（按 `data-primary-tone` 判定），只能靠属性选中变体。
      data-variant={variant ?? "default"}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
