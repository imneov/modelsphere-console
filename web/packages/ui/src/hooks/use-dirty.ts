"use client"
// useDirty —— 「这份表单被改过没有」。
//
// ══════════════════════════════════════════════════════════════════════════════
// 给抽屉的关闭守卫用（`Sheet` 的 `dirty`）：没改过就随手关，改过了才问一句。
//
// ── 为什么比值，不记「有没有 setState 过」 ──────────────────────────────────
// 因为**改了又改回来必须算没改**。记标志位的做法做不到这一点：用户输错一个字符又删掉，
// 标志位已经翻了，关的时候照样被问一句「你有修改」—— 而他确实什么都没改。
// 被问过几次假警报之后，所有人都会闭眼点「放弃」，这个守卫就废了。
//
// ── 归一化是这件事的全部难点 ────────────────────────────────────────────────
// 表单里「空」有三种写法：`undefined`（字段没出现）、`null`（清空过）、`''`（输入框空串）。
// 它们在用户眼里是同一件事，直接深比较会把「打开抽屉什么都没动」判成脏 ——
// 那正是上面说的假警报。所以比之前先归一化：
//
//   · `null` / `undefined` / `''`  →  一律视作「空」，彼此相等
//   · 数字 `0`、布尔 `false`        →  **不算空**，它们是真实的值
//   · 数组按顺序比                  →  顺序变了就是改了（阶梯档位、键值对重排是真改动）
//   · 对象按键比，忽略「空」键      →  `{a: ''}` 与 `{}` 相等
//
// 需要排除的字段（UI 态混在表单对象里的那种）走 `ignore`。
import * as React from "react"

/** 空值口径：三种写法归一。数字 0 / 布尔 false 不在其列 —— 它们是值，不是空。 */
function isBlank(v: unknown): boolean {
  return v === undefined || v === null || v === ""
}

/** 结构相等（已归一化）。不用 JSON.stringify：那个吃键序、也认不出 undefined 与缺键相等。 */
function equal(a: unknown, b: unknown): boolean {
  if (isBlank(a) && isBlank(b)) return true
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((x, i) => equal(x, b[i]))
  }
  if (typeof a === "object" && typeof b === "object" && a && b) {
    const ka = Object.keys(a as object).filter(k => !isBlank((a as Record<string, unknown>)[k]))
    const kb = Object.keys(b as object).filter(k => !isBlank((b as Record<string, unknown>)[k]))
    if (ka.length !== kb.length) return false
    return ka.every(k => equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return false
}

/** 对外暴露一份，给调用方拼自己的判据用（比如「YAML 文本与模型不同步」那种额外条件）。 */
export const isSameFormValue = equal

export interface UseDirtyOptions {
  /** 不参与比较的键（UI 态、展开状态这类混在同一个对象里的东西）。 */
  ignore?: readonly string[]
}

/**
 * @param value    表单的当前值。**整份传进来**（一个对象），不要传散着的十几个 state ——
 *                 散着传就得在调用点自己拼数组，拼漏一个就是漏判，而漏判会真丢数据。
 * @param baseline 「没改过」长什么样。**创建**传初始值常量；**编辑**传后端回来的那份数据，
 *                 没回来之前传 `undefined`。
 *
 * ── 为什么基线由调用方给，而不是组件自己拍快照 ──────────────────────────────
 * 因为**编辑抽屉的数据是异步来的**。让 hook 在「打开」那一刻拍快照，拍到的是还没填充
 * 的空表单；接口返回后页面把数据灌进去，值就和基线不一样了 —— 用户什么都没碰，
 * 一关就被问「你有修改」。让调用方说「基线是这份数据」，这个时序问题就不存在了。
 *
 * `baseline` 是 `undefined` 时 `dirty` 恒为 false：还没有基线可比，也就谈不上脏 ——
 * 而且那时候用户确实还没东西可丢。
 *
 * 不用担心每次渲染传新对象字面量：比的是结构不是引用。
 */
export function useDirty<T>(
  value: T,
  baseline: T | undefined,
  options: UseDirtyOptions = {},
): boolean {
  const { ignore } = options

  const strip = React.useCallback(
    (v: T): unknown => {
      if (!ignore?.length || !v || typeof v !== "object" || Array.isArray(v)) return v
      const out: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (!ignore.includes(k)) out[k] = val
      }
      return out
    },
    [ignore],
  )

  if (baseline === undefined) return false
  return !equal(strip(value), strip(baseline))
}
