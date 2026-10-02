const INTERACTIVE_DESCENDANT_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "[role='button']",
  "[role='link']",
  "[role='checkbox']",
  "[role='switch']",
  "[role='radio']",
  "[role='combobox']",
  "[role='option']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='menuitemcheckbox']",
  "[role='menuitemradio']",
  "[role='slider']",
  "[role='spinbutton']",
  "[role='textbox']",
  "[role='searchbox']",
  "[role='treeitem']",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable]:not([contenteditable='false'])",
].join(",")

type ClosestTarget = {
  closest(selector: string): unknown
}

export function isRowActivationEnabled<T>(
  row: T,
  onActivate: ((row: T) => void) | undefined,
  isRowActivatable?: (row: T) => boolean
): boolean {
  return Boolean(onActivate) && isRowActivatable?.(row) !== false
}

export function shouldActivateRowFromPointer(target: unknown, rowElement: unknown): boolean {
  if (
    typeof target !== "object" ||
    target === null ||
    !("closest" in target) ||
    typeof (target as ClosestTarget).closest !== "function"
  ) {
    return true
  }

  const interactiveElement = (target as ClosestTarget).closest(INTERACTIVE_DESCENDANT_SELECTOR)
  return interactiveElement === null || interactiveElement === rowElement
}

export interface RowKeyboardEventLike {
  key: string
  target: unknown
  currentTarget: unknown
  preventDefault(): void
}

export function activateRowFromKeyboard<T>(
  event: RowKeyboardEventLike,
  row: T,
  onActivate: (row: T) => void
): boolean {
  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) {
    return false
  }

  event.preventDefault()
  onActivate(row)
  return true
}
