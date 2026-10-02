import assert from "node:assert/strict"
import { test } from "vitest"
import { resolveHiddenColumns, toggleColumnVisibility } from "./resource-table-column-visibility"

const columns = [
  { key: "name" },
  { key: "status" },
  { key: "owner", defaultHidden: true },
  { key: "project", defaultHidden: true },
]

const sorted = (s: Set<string>) => [...s].sort()

test("没有记录时只看 defaultHidden", () => {
  assert.deepEqual(sorted(resolveHiddenColumns(columns, undefined)), ["owner", "project"])
  assert.deepEqual(sorted(resolveHiddenColumns(columns, {})), ["owner", "project"])
})

test("记录优先于 defaultHidden", () => {
  assert.deepEqual(sorted(resolveHiddenColumns(columns, { owner: true, status: false })), ["project", "status"])
})

test("切换后写入全部当前列，defaultHidden 之后不再改变这些列", () => {
  const next = toggleColumnVisibility(columns, undefined, "owner", true)
  assert.deepEqual(next, { name: true, status: true, owner: true, project: false })

  const flipped = columns.map((c) => ({ ...c, defaultHidden: !c.defaultHidden }))
  assert.deepEqual(sorted(resolveHiddenColumns(flipped, next)), ["project"])
})

test("旧 key 被忽略，新增列按 defaultHidden 取初值", () => {
  const stored = { name: true, removed: false, owner: true }
  const changed = [{ key: "name" }, { key: "owner", defaultHidden: true }, { key: "added", defaultHidden: true }]
  assert.deepEqual(sorted(resolveHiddenColumns(changed, stored)), ["added"])
})

test("暂时不在列集合里的旧记录保留，列回来时恢复", () => {
  const stored = { project: true }
  const without = columns.filter((c) => c.key !== "project")
  const next = toggleColumnVisibility(without, stored, "status", false)
  assert.equal(next.project, true)
  assert.deepEqual(sorted(resolveHiddenColumns(columns, next)), ["owner", "status"])
})

test("原型链上的同名属性不算记录", () => {
  const cols = [{ key: "toString", defaultHidden: true }]
  assert.deepEqual(sorted(resolveHiddenColumns(cols, {})), ["toString"])
})
