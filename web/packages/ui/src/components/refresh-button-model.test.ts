import assert from "node:assert/strict"
import { test } from "vitest"
import { refreshDelayMs, resolveInitialInterval, shouldAutoRefresh } from "./refresh-button-model"

const LADDER = [5, 10, 30, 60]

test("不传 defaultInterval：初值为 0（关闭），与加这个 prop 之前一致", () => {
  assert.deepEqual(resolveInitialInterval({ ladder: LADDER, showAuto: true }), { interval: 0 })
  assert.deepEqual(resolveInitialInterval({ ladder: LADDER, showAuto: false }), { interval: 0 })
  assert.deepEqual(resolveInitialInterval({ defaultInterval: 0, ladder: LADDER, showAuto: true }), { interval: 0 })
})

test("传档位里的值：首帧即按它计时", () => {
  assert.deepEqual(resolveInitialInterval({ defaultInterval: 30, ladder: LADDER, showAuto: true }), { interval: 30 })
  assert.equal(refreshDelayMs(30, true), 30_000)
})

test("传档位外的值：回落到 0 并给出告警文案", () => {
  for (const bad of [15, -1, 0.5, Number.NaN]) {
    const r = resolveInitialInterval({ defaultInterval: bad, ladder: LADDER, showAuto: true })
    assert.equal(r.interval, 0)
    assert.match(r.warning ?? "", /不在档位里/)
  }
})

test("没有下拉（autoRefresh={false}）时不接默认间隔：用户关不掉的计时器就是幽灵定时器", () => {
  const r = resolveInitialInterval({ defaultInterval: 30, ladder: LADDER, showAuto: false })
  assert.equal(r.interval, 0)
  assert.match(r.warning ?? "", /autoRefresh/)
})

test("interval 为 0 不设计时器（防 `||` 把 0 当成没传的同类回归）", () => {
  assert.equal(refreshDelayMs(0, true), null)
  assert.equal(refreshDelayMs(-5, true), null)
  assert.equal(refreshDelayMs(Number.NaN, true), null)
})

test("下拉不在时不设计时器：挂载后 autoRefresh 变 false，已在计时的档位也要停", () => {
  assert.equal(refreshDelayMs(30, false), null)
})

test("上一轮还在加载时跳过自动刷新这一拍，否则慢查询每拍被中止重来、永远出不来", () => {
  assert.equal(shouldAutoRefresh(true), false)
  assert.equal(shouldAutoRefresh(false), true)
})
