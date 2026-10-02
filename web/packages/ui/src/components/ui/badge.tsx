// ⚠️ 本地改动（相对 shadcn 官方 base-nova）—— 用 `shadcn-diff` 脚本对账
// ─────────────────────────────────────────────────────────────────────────────
// 1. **新增 `success` / `warning` / `info` 三档**。官方只有 default / secondary /
//    destructive / outline，于是「已就绪」「已漂移」「即将过期」这类**自带结论**的词
//    没有档位可用，页面就各自手写 `bg-amber-100 text-amber-700`（实测 38 处）——
//    那些不跟主题、不跟暗色。画法照 `Alert` 的 warning 与官方 destructive 同一个公式
//    （`bg-X/10 text-X`），三处语义色因此长得一样。
//
//    ⚠️ **判据是「这个词自己带不带好坏」**，不是「想让它显眼」：分类、来源、类型
//    （本地模型 / 公共 / 整卡）一律中性档 —— 本地不比远程好，整卡不比切分好。
//    这条 LF 2026-09-09 在算力卡型号页定过一次（「属性值不要奇怪的颜色」）。
//    会变的东西用 `StatusIndicator`，好坏判断走 `thresholdColor`，Badge 只承载静态属性。
//    详见 PATTERNS §5.6「标签（Badge）」。
//
// **形状保持官方的胶囊**（`rounded-4xl`）：2026-09-09 试过改成与全站一致的 `rounded-md`，
// LF 实看否掉 —— 方角的标签和 `Button` 太像，而标签不可点、按钮可点，形状是这两者之间
// 唯一的静态区分（标签也没有 hover）。这里的「与全站圆角一致」不如「一眼看出不是按钮」值钱。

import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        // 本仓补的三档，与上面 destructive 同一个公式（见文件头 1）
        success:
          "bg-success/10 text-success dark:bg-success/20 [a]:hover:bg-success/20",
        warning:
          "bg-warning/10 text-warning dark:bg-warning/20 [a]:hover:bg-warning/20",
        info:
          "bg-info/10 text-info dark:bg-info/20 [a]:hover:bg-info/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
