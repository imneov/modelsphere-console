"use client"

// RefreshButton —— 手动刷新 + 自动刷新间隔的分裂按钮。
//
// ══════════════════════════════════════════════════════════════════════════════
// 点图标即刷新，点箭头选自动刷新间隔。控制台页面常驻（盯部署进度、盯监控曲线），
// 自动刷新是真实需求，而它和手动刷新是同一件事的两种触发方式 —— 拆成两个控件
// 会占两倍横向空间，还得让用户自己建立「这两个是一回事」的联系。
//
// ── 为什么抽出来 ──────────────────────────────────────────────────────────
// 这段原本长在 ResourceTable 内部。监控页需要同一个东西时，抄一份过去就是两处
// 各自演化的开始：间隔梯度、下拉里的文案、loading 时的转圈行为迟早会不一致。
// 同一个东西第二次出现就该收编 —— 这条规则本仓对图表形态也是这么定的。
//
// ── 计时器与梯度都归组件自己管 ────────────────────────────────────────────
// 调用方只给 `onRefresh`：不写 setInterval（漏 clearInterval 就是幽灵定时器，
// 页面切走了还在发请求），也不给档位（见 REFRESH_INTERVALS）。
//
// ── 选完即关 ──────────────────────────────────────────────────────────────
// 档位是互斥单选，用 RadioGroup 不用 CheckboxItem —— 后者的 ARIA 是复选框，
// 读屏会念成「可多选」。两者的指示器都是同一个 CheckIcon，视觉无差别。
// Base UI 的 `closeOnClick` 两种 item 都默认 false，必须显式传。
//
// ── 默认间隔只是初值 ──────────────────────────────────────────────────────
// `defaultInterval` 决定首帧从哪一档起步，之后归用户切换，prop 再变也不跟。
// 判定规则（档位外 / 没有下拉时回落到关闭）在 refresh-button-model.ts。

import * as React from "react"
import { ChevronDown, RotateCw } from "lucide-react"
import { cn } from "../utils"
import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { refreshDelayMs, resolveInitialInterval, shouldAutoRefresh } from "./refresh-button-model"
import { useUiT, useUiLocale } from "../i18n/index"

/**
 * 自动刷新的默认档位（秒）。**梯度归组件持有，调用方不再各给一份** —— 收编前有
 * 六个插件各抄了一份 `[15, 30, 60, 300]`，正是本文件头说的那种分叉。
 * 确实需要另一套梯度时传 `intervals`，那是例外不是常态。
 *
 * 上限到 2 小时：再长就不该靠页面挂着轮询了。
 */
export const REFRESH_INTERVALS = [5, 10, 30, 60, 300, 900, 1800, 3600, 7200]

/** 秒 → 短码。**触发器与下拉共用同一个** —— 两处形式不一致就对不上号。 */
const fmtInterval = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${s / 60}m` : `${s / 3600}h`)

export interface RefreshButtonProps {
  /** 点图标、或自动刷新触发时调用 */
  onRefresh?: () => void
  /** 请求进行中：图标转圈并禁用点击 */
  loading?: boolean
  /** 出不出自动刷新的下拉箭头。不开就是一个纯刷新图标按钮。 */
  autoRefresh?: boolean
  /**
   * 自定义档位（秒），**只在这一档梯度确实和别处不同时才传** —— 默认走
   * `REFRESH_INTERVALS`。给了非空数组也等同开了 `autoRefresh`。
   */
  intervals?: number[]
  /**
   * 自动刷新的初始间隔（秒），不传或 0 = 关闭。**只作初值**，之后由用户在下拉里切换。
   * 必须是档位里的值（`intervals` 或 `REFRESH_INTERVALS`），否则按关闭处理并在开发期告警。
   * 给了非 0 值也等同开了 `autoRefresh`；显式 `autoRefresh={false}` 时不生效。
   */
  defaultInterval?: number
  /** 间隔变化时通知调用方（想在别处显示「每 15 秒」时用）。 */
  onIntervalChange?: (seconds: number) => void
  className?: string
}

export function RefreshButton({
  onRefresh,
  loading = false,
  autoRefresh,
  intervals,
  defaultInterval,
  onIntervalChange,
  className,
}: RefreshButtonProps) {
  const t = useUiT()
  const lng = useUiLocale()
  // `autoRefresh` 没给时由 `intervals` / `defaultInterval` 决定出不出下拉；给了就以它为准（`false` 能关掉）。
  const showAuto = autoRefresh ?? (!!intervals?.length || !!defaultInterval)
  const ladder = intervals?.length ? intervals : REFRESH_INTERVALS

  const [initial] = React.useState(() => resolveInitialInterval({ defaultInterval, ladder, showAuto }))
  const [interval, setIntervalSec] = React.useState(initial.interval)
  const [lastRefresh, setLastRefresh] = React.useState<Date | null>(null)

  const doRefresh = React.useCallback(() => {
    onRefresh?.()
    setLastRefresh(new Date())
  }, [onRefresh])

  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production" && initial.warning) console.warn(initial.warning)
  }, [initial])

  // 用 ref 读 loading：放进依赖会让每次加载起止都重建计时器，计时从头算。
  const loadingRef = React.useRef(loading)
  React.useEffect(() => {
    loadingRef.current = loading
  }, [loading])

  React.useEffect(() => {
    const delay = refreshDelayMs(interval, showAuto)
    if (delay === null || !onRefresh) return
    const id = window.setInterval(() => {
      if (shouldAutoRefresh(loadingRef.current)) doRefresh()
    }, delay)
    return () => window.clearInterval(id)
  }, [interval, showAuto, onRefresh, doRefresh])

  const pick = (s: number) => {
    setIntervalSec(s)
    onIntervalChange?.(s)
  }

  const icon = <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />

  if (!showAuto) {
    return (
      <Button
        variant="outline"
        size="icon"
        aria-label={t("refreshButton.refresh")}
        disabled={loading}
        onClick={doRefresh}
        className={className}
      >
        {icon}
      </Button>
    )
  }

  return (
    <div className={cn("flex items-center", className)}>
      <Button
        variant="outline"
        size="icon"
        aria-label={t("refreshButton.refresh")}
        className="rounded-r-none"
        disabled={loading}
        onClick={doRefresh}
      >
        {icon}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              aria-label={
                interval
                  ? t("refreshButton.autoRefreshEvery", { interval: fmtInterval(interval) })
                  : t("refreshButton.autoRefreshInterval")
              }
              // 开着自动刷新时把当前档位摆在箭头左边：这是页面上唯一能看出「数据在自己
              // 更新、多久一次」的地方，收进下拉里等于要点开才知道。
              className={cn("rounded-l-none border-l-0", interval ? "w-auto gap-1 px-2" : "w-6")}
            >
              {interval ? (
                <span className="text-xs tabular-nums">{fmtInterval(interval)}</span>
              ) : null}
              <ChevronDown className="h-3 w-3" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            {/* 标题位放「上次刷新」而不是「自动刷新」——用户点开这个下拉，
                十有八九是想知道数据有多新，而不是想读一个标签。 */}
            <DropdownMenuLabel>
              {lastRefresh
                ? t("refreshButton.lastRefresh", { time: lastRefresh.toLocaleTimeString(lng, { hour12: false }) })
                : t("refreshButton.autoRefresh")}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={String(interval)}
            onValueChange={(value: string) => pick(Number(value))}
          >
            <DropdownMenuRadioItem value="0" closeOnClick>
              {t("refreshButton.off")}
            </DropdownMenuRadioItem>
            {ladder.map((s) => (
              <DropdownMenuRadioItem key={s} value={String(s)} closeOnClick>
                {fmtInterval(s)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
