/**
 * `FieldCombobox` 的选择模型 —— 纯函数，组件只负责渲染。
 *
 * 与 `DataSelect` 的区别只有一条：候选是**建议**不是闭集，用户可以提交一个不在
 * 候选里的值。那条「用我输入的」由本模块算出来，组件把它当成列表里的一项渲染，
 * 于是「选一个已有的」和「用自己填的」在交互上是同一个动作（点一下 / 回车）。
 */

export interface ComboboxOption {
  value: string
  label: string
  description?: string
}

export interface ComboboxChoices {
  /** 按输入筛过的候选，顺序同传入顺序。 */
  matched: ComboboxOption[]
  /**
   * 输入值本身可以直接提交时的那一条；已经和某个候选重合、或输入为空时是 `undefined`。
   * 排在候选之后 —— 先看现成的，没有合适的再用自己填的。
   */
  custom?: string
  /** `matched` 的值加上 `custom`，喂给原语做键盘导航。 */
  items: string[]
}

/** 大小写不敏感的包含匹配：路径、标识符这类候选大小写往往不稳定。 */
const hit = (option: ComboboxOption, needle: string) =>
  option.value.toLowerCase().includes(needle) || option.label.toLowerCase().includes(needle)

export function comboboxChoices(options: readonly ComboboxOption[], query: string): ComboboxChoices {
  const trimmed = query.trim()
  if (!trimmed) {
    return { matched: [...options], items: options.map((o) => o.value) }
  }
  const needle = trimmed.toLowerCase()
  const matched = options.filter((o) => hit(o, needle))
  // 与候选**完全相同**时不再多给一条：那会在列表里出现两行一模一样的值。
  const custom = options.some((o) => o.value === trimmed) ? undefined : trimmed
  return { matched, custom, items: custom ? [...matched.map((o) => o.value), custom] : matched.map((o) => o.value) }
}

/**
 * 输入框该显示什么。合起来时显示选中值（有 label 用 label），展开时显示用户正在打的字。
 * 没展开也没值就交给 placeholder。
 */
export function comboboxDisplay(
  options: readonly ComboboxOption[], value: string, query: string, open: boolean,
): string {
  if (open) return query
  if (!value) return ""
  return options.find((o) => o.value === value)?.label ?? value
}
