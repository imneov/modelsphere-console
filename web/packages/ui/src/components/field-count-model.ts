// FieldInput / FieldTextarea 的字数计数（`showCount`）。字数口径与原生 `maxLength` 相同（UTF-16 码元）。

export function countEnabled(showCount: boolean | undefined, maxLength: number | undefined): maxLength is number {
  return !!showCount && typeof maxLength === "number" && Number.isFinite(maxLength) && maxLength > 0
}

export function valueLength(value: unknown): number {
  if (value === undefined || value === null) return 0
  return String(value).length
}

export function countText(length: number, max: number): string {
  return `${length}/${max}`
}

export function atLimit(length: number, max: number): boolean {
  return length >= max
}

/** 单行框按最长形态（`上限/上限`）预留的宽度，单位为输入框字号的 `ch`。 */
export function countReserveCh(max: number): number {
  return countText(max, max).length
}

interface ResettableField {
  value: string
  form: Pick<EventTarget, "addEventListener" | "removeEventListener"> | null
}

/**
 * 非受控字段在所属表单 `reset()` 后重读字数 —— reset 不触发 `onChange`，且事件先于值恢复派发，
 * 所以推迟一轮再读。返回解除监听的函数；不在表单里时为空操作。
 */
export function syncOnFormReset(
  field: ResettableField,
  sync: (length: number) => void,
  defer: (fn: () => void) => void = (fn) => setTimeout(fn, 0),
): () => void {
  const form = field.form
  if (!form) return () => {}
  const onReset = () => defer(() => sync(field.value.length))
  form.addEventListener("reset", onReset)
  return () => form.removeEventListener("reset", onReset)
}
