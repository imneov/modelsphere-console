// 设计系统组件的取词核心：宿主经 configureUiI18n 注入 ICU 渲染与语言状态；未注入时用中文词表做最小渲染。
// 不依赖 React，也不依赖 i18next —— 校验文案、图表序列等非组件代码直接用 uiT。
import zhCN from "../locales/ui.zh-CN"

export type UiVars = Record<string, unknown>

export interface UiI18nAdapter {
  /** 按指定语言渲染 `ui` 命名空间的词条；语言由调用方给，不读宿主当前语言（水合一致性依赖这一点）。 */
  t: (locale: string, key: string, vars?: UiVars) => string
  subscribe: (cb: () => void) => () => void
  getLocale: () => string
}

/** 服务端渲染与静态导出一律按中文，与宿主 useLocaleValue 的服务端快照一致。 */
export const SERVER_LOCALE = "zh-CN"

type Translate = (key: string, vars?: UiVars) => string

let adapter: UiI18nAdapter | null = null
let detachAdapter: (() => void) | null = null
const listeners = new Set<() => void>()
const cache = new Map<string, Translate>()

function emit(): void {
  for (const cb of listeners) cb()
}

export function configureUiI18n(next: UiI18nAdapter): void {
  detachAdapter?.()
  adapter = next
  cache.clear()
  detachAdapter = next.subscribe(emit)
  emit()
}

export function resetUiI18nForTest(): void {
  detachAdapter?.()
  detachAdapter = null
  adapter = null
  cache.clear()
}

export function subscribeUiLocale(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function getUiLocale(): string {
  return adapter ? adapter.getLocale() : SERVER_LOCALE
}

function lookup(key: string): string | undefined {
  let node: unknown = zhCN
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === "string" ? node : undefined
}

const ICU_SYNTAX = new Set(["{", "}", "#", "|"])

/**
 * 未注入时的最小 ICU 渲染：只处理 {name} 插值与撇号转义（'' → '，'{…}' → {…}）。
 * 中文词条不含 plural / select（locales.test.ts 保证），所以与宿主 ICU 的输出一致。
 */
export function formatFallback(template: string, vars?: UiVars): string {
  let out = ""
  for (let i = 0; i < template.length; i++) {
    const ch = template[i]
    if (ch === "'") {
      const next = template[i + 1]
      if (next === "'") { out += "'"; i++; continue }
      if (next !== undefined && ICU_SYNTAX.has(next)) {
        const end = template.indexOf("'", i + 1)
        if (end === -1) { out += template.slice(i + 1); break }
        out += template.slice(i + 1, end)
        i = end
        continue
      }
      out += ch
      continue
    }
    if (ch === "{") {
      const end = template.indexOf("}", i)
      const name = end === -1 ? "" : template.slice(i + 1, end).trim()
      if (/^[A-Za-z_]\w*$/.test(name)) {
        const v = vars?.[name]
        // 与宿主 ICU 对齐：`null` 渲染为空串，`undefined`（含未传该变量）保留原样 `{name}`。
        if (v === null) { i = end; continue }
        out += v === undefined ? `{${name}}` : String(v)
        i = end
        continue
      }
    }
    out += ch
  }
  return out
}

function fallbackTranslate(key: string, vars?: UiVars): string {
  const template = lookup(key)
  return template === undefined ? key : formatFallback(template, vars)
}

export function translatorFor(locale: string): Translate {
  let fn = cache.get(locale)
  if (!fn) {
    const current = adapter
    fn = current ? (key, vars) => current.t(locale, key, vars) : fallbackTranslate
    cache.set(locale, fn)
  }
  return fn
}

/** 组件外取词：取调用时刻的语言。不得在模块顶层调用（加载时的语言会被永久冻结）。 */
export function uiT(key: string, vars?: UiVars): string {
  return translatorFor(getUiLocale())(key, vars)
}

/** 标记模块级表里的 key，供 usage.test.ts 收集并校验存在性。 */
export function uiKey<K extends string>(key: K): K {
  return key
}

export function formatList(items: readonly string[], locale: string = getUiLocale()): string {
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(items)
}
