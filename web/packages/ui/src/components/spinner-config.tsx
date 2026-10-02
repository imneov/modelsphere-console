"use client"

// Spinner 的全局配置 —— 偏好设置「通用」里选的图案 / 尺寸 / 颜色由此下发。
//
// ══════════════════════════════════════════════════════════════════════════════
// ── 为什么是 Context，不是 CSS 变量 ───────────────────────────────────────
// 密度、主色都走 `<html>` 上的 CSS 变量（见 console 的 preferences/contract.ts），
// 那条路对**尺寸和颜色**同样适用。但**图案换不了** —— 五种变体是不同的 SVG
// 结构，CSS 变量选不出结构。
//
// 备选是往 `<html>` 上挂 `data-spinner-variant`，组件里 `useSyncExternalStore`
// 监听。否决的原因是**每个实例都要挂一个 MutationObserver** —— 而加载态常常
// 一屏几十个（表格每行、卡片列表）。Context 是一份订阅、N 个消费者。
//
// ── 没有 Provider 时必须能用 ─────────────────────────────────────────────
// design 被 console 和所有远程插件共用，不能假设外面一定包了 Provider
// （样例页、单测、Storybook 都不会包）。所以默认值写在这里，缺 Provider 时
// 组件行为与今天完全一致。

import * as React from "react"

/**
 * 图案。
 *
 * - `matrix` 3×3 点阵呼吸（全站默认，与 console-ui 同一套观感）
 * - `ring` 描边圆环
 * - `sweep` / `trace` / `draw` / `aurora` 四种 logo 动效
 *
 * 四种 logo 动效**只在 `lg`（页面级）生效** —— `md` / `sm` 回落成 `ring`，
 * 见 spinner.tsx 文件头。`matrix` 与 `ring` 每个尺寸都能用：它们是圆点和圆环，
 * 缩到 16px 仍然读得出在动。
 */
export type SpinnerVariant = "matrix" | "ring" | "sweep" | "trace" | "draw" | "aurora"

export type SpinnerSize = "sm" | "md" | "lg"

export interface SpinnerConfig {
  /** 全站默认图案 */
  variant: SpinnerVariant
  /** 全站默认尺寸 */
  size: SpinnerSize
  /**
   * 全站默认颜色，CSS 颜色值。
   *
   * `null` = **跟随主题主色**：组件自己挂 `text-primary`（不写 inline color），
   * 于是换主题时加载动画跟着换，而调用方的 `className="text-destructive"`
   * 仍然能盖掉它（`cn` 走 tailwind-merge，后写的赢）。
   *
   * 写死一个色值会把这条口子堵上 —— 既不跟主题，也盖不掉，所以「跟随主题」
   * 这一档必须是 null 而不是某个具体色值。
   */
  color: string | null
}

export const DEFAULT_SPINNER_CONFIG: SpinnerConfig = {
  // 全站默认 = 点阵呼吸（LF 2026-09-14：与 console-ui 统一）。它每个尺寸都成立，
  // 所以这一档不再被 sm / md 回落掉；四种 logo 动效仍只在 lg 生效。
  variant: "matrix",
  // 默认 lg（LF 2026-09-14）：不带尺寸的 `<Spinner />` 出现在**整块等待**的位置
  // —— 页面骨架、对话框内容、路由切换。那些地方 24px 的图案压不住一屏空白。
  // 行内的（按钮里、表格行里）本来就显式传 sm / md，不受这条影响。
  size: "lg",
  color: null,
}

const SpinnerConfigContext = React.createContext<SpinnerConfig>(DEFAULT_SPINNER_CONFIG)

export function SpinnerConfigProvider({
  config,
  children,
}: {
  config: Partial<SpinnerConfig>
  children: React.ReactNode
}) {
  // 引用稳定：偏好面板里拖一下滑块会重渲整棵树，这里每次新建对象会让所有
  // spinner 跟着重渲。
  const value = React.useMemo(
    () => ({ ...DEFAULT_SPINNER_CONFIG, ...config }),
    [config.variant, config.size, config.color],
  )
  return <SpinnerConfigContext.Provider value={value}>{children}</SpinnerConfigContext.Provider>
}

export function useSpinnerConfig(): SpinnerConfig {
  return React.useContext(SpinnerConfigContext)
}
