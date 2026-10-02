import * as React from "react"
import { cn } from "../utils"

// SelectOptionContent —— 下拉选项里那一块内容（图标 / 标题 / 标记 / 副行）。
//
// ══════════════════════════════════════════════════════════════════════════════
// 抽出来是因为 DataSelect 有**两个引擎**（Base UI Select / Combobox），选项渲染
// 原本各写各的：Select 那条写死成 `icon + label` 一行，Combobox 那条多一个
// `renderOption` 自由渲染。结果是同一份选项数据，加不加 `searchable` 显示得不一样，
// 而且这个差异从 API 上完全看不出来 —— 属于静默降级。
//
// ── 为什么给结构化字段，而不是只留 `renderOption` ──────────────────────────
// 「带副行的选项」有两层需求：
//
//   **同一种形状、更多信息**（占绝大多数）—— 标题 + 副行 + 一个标记。
//   选服务、选模型、选集群、选镜像、选运行时……全是这个形状。
//
//   **任意形状**（极少）—— 每项是个小卡片、带进度条、带缩略图。
//
// 只给 `renderOption` 的话，第一层就没有约定：每个页面自己决定字号、颜色、间距，
// 迟早长成七八种样子（抽屉有 `size` 档位之前就是这样）。所以默认走结构化字段，
// 排版由组件定死，调用方只给数据；`renderOption` 降级为逃生口。
//
// 同一个思路见 `ResourceNameCell`：「名称 / ID 双行」我们也没让每个页面自己拼。

export interface SelectOptionContentProps {
  /** 标题。通常是字符串；HierarchySelect 的搜索结果会传带高亮的节点。 */
  label: React.ReactNode
  /** 标题左侧的图标 */
  icon?: React.ReactNode
  /**
   * 标题右侧的标记：状态、版本、类型。
   *
   * 传节点而不是字符串 —— 调用方可以给 `<Badge>`，也可以给纯文字，
   * 级别与配色归调用方（本组件不猜「这个标记是什么级别」）。
   */
  badge?: React.ReactNode
  /**
   * 副行。写**「·」连接的事实串**（`Qwen2.5-7B · A100 80G × 2 · 6/6 副本`），
   * 不要写句子 —— 它是给「扫一眼确认是不是这个」用的，不是说明文档。
   */
  description?: string
  className?: string
}

/**
 * 截断了才给 title —— 悬停那一刻量一次，不挂 ResizeObserver。
 *
 * 为什么是原生 `title` 而不是 Tooltip 组件：这里要露出的是**被截断的原文**，
 * 不是解释性说明（那种走 `FieldHint`）。选项列表动辄上百条，每条包一层浮层组件
 * 既费渲染，又会跟列表自己的悬停 / 键盘选中抢事件。同样的取舍见 `ValueText`。
 *
 * 为什么不常驻 title：没截断的行也弹一个「和屏幕上一模一样」的浮层是纯噪音。
 * `scrollWidth > clientWidth` 只在鼠标进来时算一次，一次 O(1) 的读，不影响滚动。
 */
function overflowTitle(text?: string) {
  if (!text) return undefined
  return (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget
    // +1 容差：亚像素布局下两个值会差个零点几，不留容差会给没截断的行也挂上
    if (el.scrollWidth > el.clientWidth + 1) el.setAttribute("title", text)
    else el.removeAttribute("title")
  }
}

export function SelectOptionContent({
  label,
  icon,
  badge,
  description,
  className,
}: SelectOptionContentProps) {
  // label 允许是节点（搜索结果会传带高亮的片段），只有字符串才拿得到原文
  const labelText = typeof label === "string" ? label : undefined

  // 没有副行时保持单行结构，不要为了"统一"套一层 flex-col ——
  // 那会让纯文字选项的行高莫名其妙比别处高一点
  if (!description && !badge) {
    return (
      <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
        {icon && <span className="inline-flex shrink-0">{icon}</span>}
        <span className="truncate" onMouseEnter={overflowTitle(labelText)}>{label}</span>
      </span>
    )
  }

  return (
    <span className={cn("flex min-w-0 items-start gap-2", className)}>
      {icon && <span className="mt-0.5 inline-flex shrink-0">{icon}</span>}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium" onMouseEnter={overflowTitle(labelText)}>{label}</span>
          {badge && <span className="inline-flex shrink-0">{badge}</span>}
        </span>
        {description && (
          // 副行压一档字号 + muted：两级对比而非两种颜色，眼睛先落在标题上
          <span className="truncate text-xs text-muted-foreground" onMouseEnter={overflowTitle(description)}>
            {description}
          </span>
        )}
      </span>
    </span>
  )
}
