// 取词核心的回归测试：未注入回落、ICU 引号转义还原、按语言缓存、订阅通知。
// 跑：node --test src/i18n/store.test.ts
import { test } from "vitest"
import assert from "node:assert/strict"
import {
  SERVER_LOCALE,
  configureUiI18n,
  formatFallback,
  formatList,
  getUiLocale,
  resetUiI18nForTest,
  subscribeUiLocale,
  translatorFor,
  uiKey,
  uiT,
} from "./store"

test("未注入时用中文词表，缺 key 返回 key 原文", () => {
  resetUiI18nForTest()
  assert.equal(getUiLocale(), SERVER_LOCALE)
  assert.equal(uiT("shared.cancel"), "取消")
  assert.equal(uiT("shared.nope"), "shared.nope")
  assert.equal(uiT("shared"), "shared", "指向对象而不是字符串时同样按缺 key 处理")
})

test("formatFallback：插值、ICU 引号转义、缺参数保留占位", () => {
  assert.equal(formatFallback("共 {n} 条", { n: 1200 }), "共 1200 条", "简单参数不加千分位，与 ICU 的 {n} 一致")
  assert.equal(formatFallback("格式应为 '{项目名}'/'{制品名}'，各段"), "格式应为 {项目名}/{制品名}，各段")
  assert.equal(formatFallback("it''s {n}", { n: 3 }), "it's 3")
  assert.equal(formatFallback("单引号 ' 后面不是语法字符时原样保留"), "单引号 ' 后面不是语法字符时原样保留")
  assert.equal(formatFallback("缺 {x} 参数"), "缺 {x} 参数")
  assert.equal(formatFallback("{label}：x", { label: null }), "：x", "null 渲染为空串，与宿主 ICU 一致")
})

test("formatList 按语言连接", () => {
  assert.equal(formatList(["甲", "乙", "丙"], "zh-CN"), "甲、乙和丙")
  assert.equal(formatList(["a", "b"], "en-US"), "a and b")
  assert.equal(formatList(["甲"], "zh-CN"), "甲")
})

test("注入后按语言取词；同一语言返回同一函数对象，换语言换对象", () => {
  resetUiI18nForTest()
  let lng = "zh-CN"
  const subs = new Set<() => void>()
  configureUiI18n({
    t: (l, k, v) => `${l}|${k}|${JSON.stringify(v ?? {})}`,
    subscribe: (cb) => { subs.add(cb); return () => { subs.delete(cb) } },
    getLocale: () => lng,
  })
  const en = translatorFor("en-US")
  assert.equal(translatorFor("en-US"), en)
  assert.notEqual(translatorFor("zh-CN"), en)
  assert.equal(en("shared.cancel", { n: 1 }), 'en-US|shared.cancel|{"n":1}')

  let hits = 0
  const off = subscribeUiLocale(() => { hits++ })
  lng = "en-US"
  for (const cb of subs) cb()
  assert.equal(hits, 1, "宿主语言变化必须通知订阅者")
  assert.equal(getUiLocale(), "en-US")
  assert.equal(uiT("x.y"), "en-US|x.y|{}")
  off()
  resetUiI18nForTest()
})

test("注入发生在订阅之后，订阅者仍会收到通知", () => {
  resetUiI18nForTest()
  let hits = 0
  const off = subscribeUiLocale(() => { hits++ })
  configureUiI18n({ t: () => "x", subscribe: () => () => {}, getLocale: () => "en-US" })
  assert.equal(hits, 1)
  off()
  resetUiI18nForTest()
})

test("uiKey 是恒等函数", () => {
  assert.equal(uiKey("shared.cancel"), "shared.cancel")
})
