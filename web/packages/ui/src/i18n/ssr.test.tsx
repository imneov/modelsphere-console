// Server rendering must not throw, and renders zh-CN whatever the host's locale,
// so the first hydrated frame matches the static HTML.
import { test } from "vitest"
import assert from "node:assert/strict"
import { createElement as h } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ResourceTable } from "../components/resource-table"
import { DataSelect } from "../components/data-select"
import { TypeToConfirm } from "../components/type-to-confirm"
import { Spinner } from "../components/spinner"
import { configureUiI18n } from "../i18n-host"
import { resetUiI18nForTest } from "./store"

const table = (props: Record<string, unknown>) =>
  h(ResourceTable as never, { data: [], columns: [{ key: "name", title: "名称", render: (r: { name: string }) => r.name }], rowKey: "id", showColumnToggle: false, ...props })

function renderAll(): string {
  return [
    table({}),
    h(DataSelect as never, { options: [], value: "" }),
    h(TypeToConfirm as never, { token: "delete", value: "", onValueChange() {} }),
    h(DataSelect as never, { options: [{ value: "a", label: "甲" }, { value: "b", label: "乙" }], multiple: true, values: ["a", "b"], onValuesChange() {} }),
    h(Spinner, {}),
    h(Spinner, { variant: "aurora", size: "lg" }),
  ].map((el) => renderToStaticMarkup(el)).join("\n")
}

test("without a host adapter: no throw, Chinese", () => {
  resetUiI18nForTest()
  const html = renderAll()
  for (const s of ["暂无数据", "请选择", "在此输入", "甲和乙"]) assert.match(html, new RegExp(s))
})

test("Spinner aurora lg without label falls back to 加载中", () => {
  resetUiI18nForTest()
  assert.match(renderToStaticMarkup(h(Spinner, { variant: "aurora", size: "lg" })), /aria-label="加载中"/)
})

test("host in English: SSR still renders the zh-CN server snapshot", () => {
  resetUiI18nForTest()
  configureUiI18n({ t: (lng, key) => `${lng}|${key}`, subscribe: () => () => {}, getLocale: () => "en-US" })
  const html = renderAll()
  assert.match(html, /zh-CN\|shared\.noData/)
  assert.match(html, /zh-CN\|spinner\.loading/)
  assert.doesNotMatch(html, /en-US\|/)
  resetUiI18nForTest()
})

test("an explicit empty string is not replaced by the default", () => {
  resetUiI18nForTest()
  assert.doesNotMatch(renderToStaticMarkup(table({ emptyTitle: "" })), /暂无数据/)
  assert.doesNotMatch(renderToStaticMarkup(h(Spinner, { label: "" })), /aria-label=/)
})
