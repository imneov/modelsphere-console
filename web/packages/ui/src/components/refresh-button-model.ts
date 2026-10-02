// RefreshButton 的纯逻辑：初始间隔怎么定、什么时候该挂计时器。
// 抽出来是为了能在 node:test 下钉住，组件本身只负责渲染和挂 setInterval。

export interface InitialIntervalInput {
  /** 调用方给的默认间隔（秒），0 / 不传 = 关闭 */
  defaultInterval?: number
  /** 下拉里实际出现的档位 */
  ladder: readonly number[]
  /** 有没有下拉。没有下拉时用户关不掉，不接默认间隔 */
  showAuto: boolean
}

export interface InitialInterval {
  interval: number
  /** 传入值被丢弃的原因，组件在开发期 console.warn 出来 */
  warning?: string
}

/**
 * 初始间隔只取一次，之后由用户在下拉里切换。
 * 不在档位里的值回落到 0：下拉里没有对应的选项，用户看不出、也切不回这一档。
 */
export function resolveInitialInterval({ defaultInterval, ladder, showAuto }: InitialIntervalInput): InitialInterval {
  // 不传与 0 都是「关闭」，不算非法、不告警。
  if (defaultInterval === undefined || defaultInterval === 0) return { interval: 0 }
  if (!showAuto) {
    return {
      interval: 0,
      warning: `[RefreshButton] defaultInterval=${defaultInterval} 被忽略：autoRefresh 关着，用户没有下拉可以关掉它。`,
    }
  }
  if (!ladder.includes(defaultInterval)) {
    return {
      interval: 0,
      warning: `[RefreshButton] defaultInterval=${defaultInterval} 不在档位里（${ladder.join(", ")}），按「关闭」处理。`,
    }
  }
  return { interval: defaultInterval }
}

/**
 * 计时器周期（毫秒）；返回 null 表示不挂计时器。只有正数才计时，0 就是关。
 * 下拉不在（`showAuto` 为 false）时也不计时：用户看不见、关不掉的计时器就是幽灵定时器。
 */
export function refreshDelayMs(interval: number, showAuto: boolean): number | null {
  return showAuto && interval > 0 ? interval * 1000 : null
}

/** 自动刷新到点时要不要真的触发：上一轮还在加载就跳过这一拍，否则慢查询每拍被中止重来。 */
export function shouldAutoRefresh(loading: boolean): boolean {
  return !loading
}
