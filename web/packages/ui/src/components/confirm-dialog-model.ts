// ConfirmDialog 的纯判定，单测直接 import（组件文件含 JSX，node --test 读不了）。

type ConfirmItemLike = string | { name: string; id?: string }

export function confirmItemName(it: ConfirmItemLike): string {
  return typeof it === "string" ? it : it.name
}

export function confirmItemId(it: ConfirmItemLike): string {
  return typeof it === "string" ? it : (it.id ?? it.name)
}

/**
 * 单项、且清单显示的就是要抄的串 → 串只在清单里出现一次（清单行带复制键），闸门不再重复展示。
 * 清单显示名称而要抄 id、或批量抄固定词时返回 false：那时闸门的展示块是唯一告诉用户「抄什么」的地方。
 */
export function isTokenShownInList(items: readonly ConfirmItemLike[] | undefined, token: string): boolean {
  if (!token || !items || items.length !== 1) return false
  return confirmItemName(items[0]!) === token
}
