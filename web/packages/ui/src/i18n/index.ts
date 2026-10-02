// 组件内取词入口。只供 design 包内部相对导入，不从 src/index.ts 导出（插件契约只增不减）。
import * as React from "react"
import { SERVER_LOCALE, getUiLocale, subscribeUiLocale, translatorFor } from "./store"

export { formatList, uiKey, uiT } from "./store"
export type { UiVars } from "./store"

/** 当前语言。服务端与水合阶段为 zh-CN，与静态导出的 HTML 一致；水合后切到宿主语言。 */
export function useUiLocale(): string {
  return React.useSyncExternalStore(subscribeUiLocale, getUiLocale, () => SERVER_LOCALE)
}

/** 组件内取词。同一语言返回同一个函数对象，可以放进 useCallback / useMemo 的依赖。 */
export function useUiT(): ReturnType<typeof translatorFor> {
  return translatorFor(useUiLocale())
}
