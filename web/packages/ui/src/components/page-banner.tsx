"use client"
/**
 * 页头（PageBanner）—— 页面顶部的「这是什么」：图标 + 标题 + 描述 + 操作区。
 *
 * ── 两种形态 ────────────────────────────────────────────────────────────
 * - `flush`：贴边 —— 上左右无间距，只有下边框。
 * - `card`：浮起 —— 四边留白 + 边框 + 圆角。圆角用 `rounded-lg`（= `--radius`），
 *   **自动跟偏好设置的圆角**，组件不写死数值。
 * - `auto`（默认）：跟偏好设置的「页头风格」走（默认风格 = 贴边、经典风格 = 浮起），
 *   **与布局完全解耦**，任何布局下都可切换。纯 CSS 响应
 *   `<html data-page-banner-style>`（偏好契约 `applyDomContract` 写入），
 *   不读 store、SSR 不闪。
 *
 * ── 全局开关 ────────────────────────────────────────────────────────────
 * 偏好设置「启用页头」关掉时，console 往 `<html>` 写 `data-page-banner="off"`，
 * 本组件用 CSS 整体隐藏 —— 所有页面一起消失，页面代码零改动。
 *
 * 折叠：右上角按钮收起**描述**（标题永远在）——描述是给第一次来的人看的，
 * 熟了之后它只占高度。
 */
import * as React from "react"
import { ChevronLeft, ChevronsDown, ChevronsUp } from "lucide-react"
import { cn } from "../utils"
import { useUiT } from "../i18n/index"
import { Button } from "./ui/button"

export type PageBannerVariant = "auto" | "flush" | "card"

export interface PageBannerProps {
  /** 标题。收 ReactNode —— 可放「名称 + 状态徽标」 */
  title: React.ReactNode
  /** 描述：这个页面管什么、能干什么。给第一次来的人看，可被折叠按钮收起 */
  description?: React.ReactNode
  /** 标题左侧图标（尺寸由调用方给，常用 size-5） */
  icon?: React.ReactNode
  /** 传入即显示返回箭头 */
  onBack?: () => void
  /** 右侧操作区 */
  actions?: React.ReactNode
  /** 形态，默认 `auto`（跟 `data-layout` 走，见文件头） */
  variant?: PageBannerVariant
  /** 有描述时是否显示「收起描述」按钮 */
  collapsible?: boolean
  className?: string
}

/*
 * ── 双层结构：外层衬底 + 内层卡片 ──────────────────────────────────────
 * 页头位于页面滚动区**外面**（顶层容器是白底），灰底画布从内容区才开始。
 * 浮起形态若只给卡片加边距，卡就浮在一片白上 —— 白上白看不出层次，还和下方
 * 灰底断开（2026-09-02 实测抓到）。所以浮起时**外层自带 `bg-surface-page` 衬底**，
 * 与内容区的灰底连成一片；贴边时外层完全透明，只剩卡片本体。
 *
 * auto：跟偏好设置的「页头风格」走（`<html data-page-banner-style>`，与布局无关）。
 */
/*
 * ⚠️ 类名必须以**完整字符串**写死，不能用模板串拼前缀 —— Tailwind 是静态文本扫描，
 * `${CLS}bg-surface-page` 这种拼出来的类它看不见，整组样式静默不生成
 * （2026-09-02 实测踩过：浮起形态整个失效，页面上毫无报错）。
 */
/** 外层衬底：浮起时灰底 + 四边留白（下方不留 —— 与内容区灰底相接，间距由内容区自己的 p-4 出） */
const WRAP_CARD = "bg-surface-page px-4 pt-4"
const WRAP_AUTO =
  "[[data-page-banner-style=classic]_&]:bg-surface-page " +
  "[[data-page-banner-style=classic]_&]:px-4 " +
  "[[data-page-banner-style=classic]_&]:pt-4"
/** 内层卡片：贴边 = 下边框；浮起 = 四边框 + 圆角（rounded-lg 绑 --radius，跟偏好圆角） */
const INNER_FLUSH = "border-b border-border"
const INNER_CARD = "rounded-lg border border-border"
/**
 * 「内容已经在一块板上」时**去掉页头下划线**。
 *
 * 那条线是给「页头 vs 内容」画边界的。而内容坐在板上时，**板已经把范围划出来了**，
 * 里面再切一条线是重复表达，还把一块完整的板看成了两截。
 *
 * ── 为什么是 `data-surface` 而不是 `data-layout` ─────────────────────────
 * 本包是**通用设计系统**，不认识消费方有哪些布局。`data-surface="board"` 说的是
 * 一个**外观事实**（"我现在坐在一块板上"），由宿主在它认为合适的时候打上 ——
 * 宿主换布局名、加布局、删布局，本包一行不用动。
 *
 * 反过来写成 `data-layout=minimal` 就是把消费方的布局清单焊进设计系统：
 * 那个布局哪天改名或删掉，这里会静默失效（class 还在，只是永不命中）。
 */
const BOARD_NO_UNDERLINE = "[[data-surface=board]_&]:border-b-0"

const INNER_AUTO =
  "border-b border-border " +
  "[[data-page-banner-style=classic]_&]:rounded-lg " +
  "[[data-page-banner-style=classic]_&]:border"

export function PageBanner({
  title,
  description,
  icon,
  onBack,
  actions,
  variant = "auto",
  collapsible = false,
  className,
}: PageBannerProps) {
  const t = useUiT()
  const [collapsed, setCollapsed] = React.useState(false)
  const showDescription = !!description && !collapsed
  return (
    <div
      data-slot="page-banner"
      className={cn(
        "shrink-0",
        // 偏好「启用页头」关掉 = 全站一起消失（console 写 data-page-banner="off"）
        "[[data-page-banner=off]_&]:hidden",
        variant === "card" && WRAP_CARD,
        variant === "auto" && WRAP_AUTO,
        className
      )}
    >
      <div
        className={cn(
          "relative bg-card px-6 py-4",
          variant === "flush" && INNER_FLUSH,
        BOARD_NO_UNDERLINE,
          variant === "card" && INNER_CARD,
          variant === "auto" && INNER_AUTO
        )}
      >
      {/* 容器 items-start：折叠按钮钉在右上角；图标 / 返回 / 操作区各自 self-center ——
          描述展开成两行时，图标相对整块（标题+描述）垂直居中，不悬在标题行顶上（LF 反馈） */}
      <div className={cn("flex items-start gap-3", collapsible && !!description && "pe-7")}>
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 size-7 shrink-0 self-center text-muted-foreground"
            onClick={onBack}
            aria-label={t("shared.back")}
          >
            <ChevronLeft className="size-4" />
          </Button>
        )}
        {/* 偏好「图标」关掉 = 全站收起（console 写 data-page-banner-icon="off"，默认就是 off） */}
        {icon && (
          <span className="shrink-0 self-center text-foreground [[data-page-banner-icon=off]_&]:hidden">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-lg leading-7 font-medium text-foreground">{title}</h1>
          {showDescription && (
            /* 偏好「显示说明」关掉 = 全站收起（console 写 data-page-banner-desc="off"） */
            <p className="mt-1 text-sm text-muted-foreground [[data-page-banner-desc=off]_&]:hidden">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 self-center">{actions}</div>}
      </div>
      {/*
        折叠钮：**直接贴卡片右上角**（LF 定案），无边框、无底、无投影 —— ghost 形态，
        悬停才有底色。两种页头风格同一位置。此前试过「与卡片边框拼接」和「骑边探出」
        两版，前者贴角圆角不同心必露缝、后者被判过重，都废弃。
      */}
      {collapsible && !!description && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "absolute top-0 right-0 size-7 text-muted-foreground/60 hover:text-foreground",
            // 全局说明关掉时按钮也藏：说明都没了，展开/收起无意义
            "[[data-page-banner-desc=off]_&]:hidden",
            // hover 底色的圆角：右上贴合浮起卡片的圆角，左下切出弧度，其余直角
            "rounded-none rounded-tr-lg rounded-bl-md"
          )}
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? t("pageBanner.expandDescription") : t("pageBanner.collapseDescription")}
        >
          {collapsed ? <ChevronsDown className="size-3.5" /> : <ChevronsUp className="size-3.5" />}
        </Button>
      )}
      </div>
    </div>
  )
}
