/**
 * 列显隐的受控状态：`key → 是否显示`。
 *
 * 没有记录的列按 `defaultHidden` 取初值；记录里有、当前 `columns` 里没有的 key 一律忽略，
 * 所以列集合增删不会报错或错位。
 */
export type ColumnVisibility = Record<string, boolean>

type VisibilityColumn = { key: string; defaultHidden?: boolean }

/** 算出当前要隐藏的列 key。`visibility` 为空时等价于只看 `defaultHidden`。 */
export function resolveHiddenColumns(
  columns: readonly VisibilityColumn[],
  visibility: ColumnVisibility | undefined,
): Set<string> {
  const hidden = new Set<string>()
  for (const c of columns) {
    const visible = visibility && Object.prototype.hasOwnProperty.call(visibility, c.key) ? visibility[c.key] : !c.defaultHidden
    if (!visible) hidden.add(c.key)
  }
  return hidden
}

/**
 * 切换一列后的新状态。
 *
 * 把当前每一列的显隐都写进去：用户动过一次之后，`defaultHidden` 不再影响这些列，只作首次初值。
 * 暂时不在 `columns` 里的旧记录保留（条件列回来时仍按用户的选择），解析时会被忽略。
 */
export function toggleColumnVisibility(
  columns: readonly VisibilityColumn[],
  visibility: ColumnVisibility | undefined,
  key: string,
  visible: boolean,
): ColumnVisibility {
  const hidden = resolveHiddenColumns(columns, visibility)
  const next: ColumnVisibility = { ...visibility }
  for (const c of columns) next[c.key] = !hidden.has(c.key)
  next[key] = visible
  return next
}
