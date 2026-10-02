import assert from "node:assert/strict"
import { test } from "vitest"
import { isTokenShownInList } from "./confirm-dialog-model"

test("isTokenShownInList: 单项且清单显示的就是要抄的串", () => {
  assert.equal(isTokenShownInList(["07648530-4a72"], "07648530-4a72"), true)
  assert.equal(isTokenShownInList([{ name: "svc-a" }], "svc-a"), true)
})

test("isTokenShownInList: 清单显示名称、要抄 id 时仍由闸门展示", () => {
  assert.equal(isTokenShownInList([{ name: "客服话术", id: "9f2c-e1" }], "9f2c-e1"), false)
})

test("isTokenShownInList: 批量、无清单、无闸门都不内联", () => {
  assert.equal(isTokenShownInList(["a", "b"], "delete"), false)
  assert.equal(isTokenShownInList(undefined, "x"), false)
  assert.equal(isTokenShownInList(["x"], ""), false)
  assert.equal(isTokenShownInList(["x"], "停用"), false)
})
