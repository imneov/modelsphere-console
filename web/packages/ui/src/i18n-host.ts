// 宿主专用入口（@modelsphere/ui/i18n-host）。不进 src/index.ts：configureUiI18n 是全局写入口，
// 进了 SDK.components 就会暴露给所有远程插件且以后不能删。
import zhCN from "./locales/ui.zh-CN"
import enUS from "./locales/ui.en-US"

export { configureUiI18n } from "./i18n/store"
export type { UiI18nAdapter } from "./i18n/store"

export const uiLocales = { "zh-CN": zhCN, "en-US": enUS }
