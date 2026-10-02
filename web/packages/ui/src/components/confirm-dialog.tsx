"use client"

// ConfirmDialog —— 平台唯一的确认弹窗（freeland#337，LF 2026-09-11 定）。
//
// ── 为什么只有一个 ──────────────────────────────────────────────────────────
// 此前是三个：ConfirmDialog（普通二次确认）、ConfirmDeleteDialog（批量 + 清单 + 抄 delete）、
// NameConfirmDeleteDialog（单删 + 抄标识 + 级联勾选）。三者都是 AlertDialog + TypeToConfirm，
// 各写了一遍标题、描述、footer、loading、关闭拦截；差别只是「有没有清单」「抄什么」
// 「有没有勾选项」—— 都是 props 层面的开关，而且默认值能从**动作词**和 **items 数量**机械推出。
// 三个名字等于让页面自己判断「我是哪种」，而那正是规范替它做过的判断。
//
// ── 一个词驱动默认值 ────────────────────────────────────────────────────────
//   action="删除"  → 主按钮「确认删除」、清单标题「将要删除的项目」、tone destructive、
//                    有 items 时自动开闸门（单项抄 id ?? name，多项抄 `delete`）
//   action="重启"  → 主按钮「确认重启」、tone default、不开闸门
// 想改任何一项再传对应 prop；不传 action 就是最朴素的「取消 / 确认」。
//
// ── 抄什么，单个和批量故意不一样（见 type-to-confirm.tsx 文件头）────────────
//   单个 → 抄该对象的标识（风险是选错对象，要核对身份）；列表显示的是显示名而真正该核对的
//          是 id 时，items 传 `{ name, id }`，清单显示 name、闸门抄 id。
//   多个 → 抄固定词 `delete`（风险是没意识到这是 N 条，数量交给清单呈现）；要抄「停用」
//          「删除」或别的词，`confirm="停用"`。
//   单项且清单显示的就是要抄的串 → 复制键挂在清单行，闸门只留提示语与输入框，同一个串不展示两遍。
//
// ── 失败契约：onConfirm 抛错 = 失败，弹窗留着 ─────────────────────────────
// await onConfirm() 成功后自动关闭；抛错保持打开，错因由调用方经 `error` 显示。
// 调用方若把异常 catch 掉再 setError，这里会当成成功把弹窗关掉，error 谁也看不见 ——
// 所以失败一定要 throw（或不 catch）。
//
// ── 宽度 ────────────────────────────────────────────────────────────────────
// AlertDialog 基类是 24rem（384px）。本弹窗最多有五块（标题 / 描述 / 清单 / 勾选 / 闸门），
// 闸门里还有一条 36 字符的 uuid，384 装不下 —— 默认宽度 = 基类 + 100px（LF 2026-09-11）。
//
// 底座是 AlertDialog：模态强制，点遮罩 / Esc 不关 —— 确认类弹窗不该被误触关闭（4.7）。

import * as React from "react"
import { AlertTriangle } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog"
import { Alert, AlertDescription } from "./ui/alert"
import { Checkbox } from "./ui/checkbox"
import { CopyButton } from "./copy-button"
import { Label } from "./ui/label"
import { cn } from "../utils"
import { BATCH_CONFIRM_TOKEN, TypeToConfirm, isConfirmMatched } from "./type-to-confirm"
import { confirmItemId as itemId, confirmItemName as itemName, isTokenShownInList } from "./confirm-dialog-model"
import { useUiT } from "../i18n/index"

/** 清单里的一项：字符串，或「显示名 + 要核对的标识」。 */
export type ConfirmItem = string | { name: string; id?: string }

export type ConfirmTone = "default" | "destructive"

export interface ConfirmOption {
  label: string
  description?: string
  /** 受控 */
  checked?: boolean
  /** 非受控初值；与 `checked` 二选一 */
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
}

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  /**
   * 动作词（删除 / 停用 / 重启 / 任意字）。传了就推出主按钮文案 `确认${action}`、
   * 清单标题 `将要${action}的项目`、处理中文案 `${action}中…`，以及 tone 与闸门的默认值。
   */
  action?: string
  /** 主按钮与标题的着色档。默认：action 是删除 / 停用这类破坏性动作 → destructive，其余 default */
  tone?: ConfirmTone
  /** 「将要 X 的项目」清单。单个也传一项。不传不画清单块 */
  items?: ConfirmItem[]
  /** 清单标题，默认 `将要${action}的项目：` */
  itemsLabel?: React.ReactNode
  /**
   * 闸门（抄一遍才让按）：`true` 用默认串、字符串自定义、`false` 关闭。
   * 默认：tone 为 destructive 且有 items 时开（单项抄 `id ?? name`，多项抄 `delete`），否则不开。
   */
  confirm?: boolean | string
  /** 附加勾选项（如「同时删除关联资源」）。不传不画 */
  option?: ConfirmOption
  /** 提交失败的错因；由调用方在 onConfirm 抛错后设置 */
  error?: string | null
  loading?: boolean
  /** 默认 `确认${action}`，没有 action 时「确认」 */
  confirmLabel?: string
  /** 默认「取消」 */
  cancelLabel?: string
  /** 默认 `${action}中…`，没有 action 时「处理中…」 */
  loadingLabel?: string
  /** 成功自动关闭；抛错保持打开（见文件头） */
  onConfirm: () => void | Promise<void>
  onCancel?: () => void
}

/** 这些动作词默认走 destructive：它们都在「让东西消失或停下来」。 */
// 与调用方传入的中文动作词比较，是业务判断值，不翻译；调用方传已国际化的 action 时必须显式传 tone。
const DESTRUCTIVE_ACTIONS = ["删除", "停用", "禁用", "释放", "卸载", "移除", "回收", "清空", "重置", "撤销"]

/**
 * 按 props 推出要抄的串；空串 = 不开闸门。
 * 导出是为了单测与守卫能复用同一份判据。
 */
export function resolveConfirmToken(props: Pick<ConfirmDialogProps, "confirm" | "tone" | "action" | "items">): string {
  const { confirm, items } = props
  if (confirm === false) return ""
  if (typeof confirm === "string") return confirm
  const tone = props.tone ?? (props.action && DESTRUCTIVE_ACTIONS.includes(props.action) ? "destructive" : "default")
  if (confirm !== true && (tone !== "destructive" || !items || items.length === 0)) return ""
  if (!items || items.length === 0) return ""
  return items.length === 1 ? itemId(items[0]!) : BATCH_CONFIRM_TOKEN
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  action,
  tone: toneProp,
  items,
  itemsLabel,
  confirm,
  option,
  error,
  loading = false,
  confirmLabel,
  cancelLabel,
  loadingLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useUiT()
  const tone: ConfirmTone = toneProp ?? (action && DESTRUCTIVE_ACTIONS.includes(action) ? "destructive" : "default")
  const destructive = tone === "destructive"
  const token = resolveConfirmToken({ confirm, tone, action, items })
  const tokenInList = isTokenShownInList(items, token)

  const [typed, setTyped] = React.useState("")
  const [optionChecked, setOptionChecked] = React.useState(!!option?.defaultChecked)
  const optionId = React.useId()

  // 每次打开都清空 —— 上一次残留的文本会让闸门形同虚设；勾选项回到初值
  React.useEffect(() => {
    if (open) {
      setTyped("")
      setOptionChecked(!!option?.defaultChecked)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token])

  const gated = !!token && !isConfirmMatched(typed, token)
  const checked = option?.checked ?? optionChecked

  const handleOptionChange = (next: boolean) => {
    if (option?.checked === undefined) setOptionChecked(next)
    option?.onChange?.(next)
  }

  const close = () => {
    setTyped("")
    onOpenChange(false)
  }

  const handleConfirm = async () => {
    if (gated || loading) return
    try {
      await onConfirm()
    } catch {
      // 失败：弹窗留着，错因由调用方经 error 显示
      return
    }
    close()
  }

  const handleCancel = () => {
    if (loading) return
    onCancel?.()
    close()
  }

  const okLabel = confirmLabel ?? (action ? t("confirmDialog.confirmWithAction", { action }) : t("shared.confirm"))
  const busyLabel = loadingLabel ?? (action ? t("confirmDialog.busyWithAction", { action }) : t("confirmDialog.busy"))
  const listLabel = itemsLabel ?? (action != null ? t("confirmDialog.itemsWithAction", { action }) : t("confirmDialog.items"))
  const cancelText = cancelLabel === undefined ? t("shared.cancel") : cancelLabel

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) handleCancel() }}>
      {/* 基类 24rem + 100px（见文件头）。两条 max-w 都写：基类的档位是 data-[size] 变体，
          单写 sm:max-w 会被它的特异度压住 */}
      <AlertDialogContent className="sm:max-w-[484px] data-[size=default]:sm:max-w-[484px]">
        <AlertDialogHeader>
          <AlertDialogTitle className={cn("flex items-center gap-2", destructive && "text-destructive")}>
            {destructive && <AlertTriangle className="size-5 shrink-0" aria-hidden />}
            <span>{title}</span>
          </AlertDialogTitle>
          {description && <AlertDialogDescription className="text-left">{description}</AlertDialogDescription>}
        </AlertDialogHeader>

        {items && items.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">{listLabel}</p>
            <ul className="max-h-32 overflow-y-auto rounded-lg border border-border bg-muted p-2">
              {items.map((it, i) => (
                <li key={`${itemId(it)}-${i}`} className="flex items-center gap-2 py-1 text-sm break-all text-foreground">
                  <span className="min-w-0 flex-1">• {itemName(it)}</span>
                  {tokenInList && <CopyButton text={token} aria-label={t("shared.copyToken", { token })} />}
                </li>
              ))}
            </ul>
          </div>
        )}

        {option && (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted p-3">
            <Checkbox
              id={optionId}
              checked={checked}
              onCheckedChange={(c) => handleOptionChange(!!c)}
              disabled={loading}
            />
            <div className="min-w-0 flex-1">
              <Label htmlFor={optionId} className="text-sm font-medium text-foreground">
                {option.label}
              </Label>
              {option.description && (
                <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
              )}
            </div>
          </div>
        )}

        {token && (
          <TypeToConfirm
            token={token}
            showToken={!tokenInList}
            label={tokenInList ? t("confirmDialog.typeToConfirm") : undefined}
            value={typed}
            onValueChange={setTyped}
            onSubmit={handleConfirm}
            disabled={loading}
          />
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} disabled={loading}>
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              void handleConfirm()
            }}
            disabled={loading || gated}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {loading ? busyLabel : okLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
