// 词表的静态约束：两份 key 一致、中文不写 plural / select、英文不含可疑语法与禁用措辞。
// 跑：node --test src/i18n/locales.test.ts
import { test } from "vitest"
import assert from "node:assert/strict"
import zhCN from "../locales/ui.zh-CN"
import enUS from "../locales/ui.en-US"
import { uiLocales } from "../i18n-host"

function flatten(obj: unknown, prefix = "", out = new Map<string, string>()): Map<string, string> {
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === "string") out.set(key, v)
    else flatten(v, key, out)
  }
  return out
}

const zh = flatten(zhCN)
const en = flatten(enUS)

// 平台自身出错、需要礼貌请求时才允许 Please（国际化规范 §2.4）；每条写明原因。
const PLEASE_ALLOWED: Record<string, string> = {}

test("zh 与 en 的 key 集合相同", () => {
  assert.deepEqual([...en.keys()].sort(), [...zh.keys()].sort())
})

test("宿主入口导出的词表就是这两份", () => {
  assert.equal(uiLocales["zh-CN"], zhCN)
  assert.equal(uiLocales["en-US"], enUS)
})

// 这五个是宿主 `common` 命名空间的顶层 key（schema §…「顶层 key 不得为…」），
// design 的 ui 词表若也用同名顶层 key，会在宿主合并命名空间时互相覆盖。
test("顶层 key 不与宿主 common 命名空间冲突", () => {
  const reserved = new Set(["actions", "status", "table", "terms", "misc"])
  for (const key of Object.keys(zhCN as Record<string, unknown>)) {
    assert.ok(!reserved.has(key), `顶层 key 不得为 ${key}（与宿主 common 命名空间冲突）`)
  }
})

test("中文值不含 plural / select", () => {
  for (const [k, v] of zh) assert.doesNotMatch(v, /\{\s*\w+\s*,\s*(plural|select|selectordinal)\b/, k)
})

test("英文值不含禁用措辞与可疑语法", () => {
  for (const [k, v] of en) {
    assert.notEqual(v.trim(), "", `${k}：空串会被宿主当成缺失并回落中文`)
    if (!(k in PLEASE_ALLOWED)) assert.doesNotMatch(v, /\bplease\b/i, k)
    assert.doesNotMatch(v, /\$\{/, k)
    assert.doesNotMatch(v, /\{\{/, k)
    assert.doesNotMatch(v, /&[a-z]+;|&#\d+;/i, k)
    assert.doesNotMatch(v, /[，。：；！？（）【】、“”]/, k)
    assert.doesNotMatch(v, /\p{Script=Han}/u, k)
  }
})
