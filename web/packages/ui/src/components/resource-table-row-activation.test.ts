import assert from "node:assert/strict"
import { test } from "vitest"
import {
  activateRowFromKeyboard,
  isRowActivationEnabled,
  shouldActivateRowFromPointer,
} from "./resource-table-row-activation"

test("row activation：可按行关闭，未配置默认动作时始终关闭", () => {
  const row = { id: "line-1", resolved: true }
  const activate = () => {}

  assert.equal(isRowActivationEnabled(row, undefined), false)
  assert.equal(isRowActivationEnabled(row, activate), true)
  assert.equal(isRowActivationEnabled(row, activate, (value) => value.resolved), true)
  assert.equal(isRowActivationEnabled(row, activate, () => false), false)
})

test("pointer：普通单元格内容激活整行，交互控件不重复激活", () => {
  const rowElement = { tagName: "TR" }
  assert.equal(shouldActivateRowFromPointer(null, rowElement), true)
  assert.equal(shouldActivateRowFromPointer({ closest: () => null }, rowElement), true)

  const plainCellContent = {
    // ResourceTable 的行本身带 tabIndex=0；closest() 找到行不能把普通单元格点击误判为控件。
    closest: (selector: string) => selector.includes("[tabindex]:not([tabindex='-1'])")
      ? rowElement
      : null,
  }

  const nativeButton = {
    closest: (selector: string) => selector.includes("button") ? nativeButton : null,
  }
  const ariaSwitch = {
    closest: (selector: string) => selector.includes("[role='switch']") ? ariaSwitch : null,
  }
  const customFocusableControl = {
    closest: (selector: string) => selector.includes("[tabindex]:not([tabindex='-1'])")
      ? customFocusableControl
      : null,
  }

  assert.equal(shouldActivateRowFromPointer(plainCellContent, rowElement), true)
  assert.equal(shouldActivateRowFromPointer(nativeButton, rowElement), false)
  assert.equal(shouldActivateRowFromPointer(ariaSwitch, rowElement), false)
  assert.equal(shouldActivateRowFromPointer(customFocusableControl, rowElement), false)
})

test("keyboard：焦点位于行本身时 Enter 与 Space 激活默认动作", () => {
  const row = { id: "line-1" }
  const activated: typeof row[] = []
  let prevented = 0
  const currentTarget = {}

  for (const key of ["Enter", " "]) {
    const didActivate = activateRowFromKeyboard(
      {
        key,
        target: currentTarget,
        currentTarget,
        preventDefault: () => {
          prevented += 1
        },
      },
      row,
      (value) => activated.push(value)
    )
    assert.equal(didActivate, true)
  }

  assert.deepEqual(activated, [row, row])
  assert.equal(prevented, 2)
})

test("keyboard：其他按键或焦点位于行内控件时不激活整行", () => {
  const row = { id: "line-1" }
  const activated: typeof row[] = []
  let prevented = 0
  const currentTarget = {}

  assert.equal(
    activateRowFromKeyboard(
      {
        key: "ArrowDown",
        target: currentTarget,
        currentTarget,
        preventDefault: () => {
          prevented += 1
        },
      },
      row,
      (value) => activated.push(value)
    ),
    false
  )
  assert.equal(
    activateRowFromKeyboard(
      {
        key: "Enter",
        target: { tagName: "BUTTON" },
        currentTarget,
        preventDefault: () => {
          prevented += 1
        },
      },
      row,
      (value) => activated.push(value)
    ),
    false
  )

  assert.deepEqual(activated, [])
  assert.equal(prevented, 0)
})
