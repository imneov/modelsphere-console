"use client"

// FilterSelect —— 列表页筛选区专用的选择器：**虚线 chip + ⊕**，选中后在右侧显示所选值。
//
// ══════════════════════════════════════════════════════════════════════════════
// ── 它和 DataSelect 的分工（判据机械，别凭手感选）────────────────────────
//
//   `DataSelect`    值是**必须填的**、或者这一栏总要显示当前值 → 固定宽度的下拉框
//                   典型：表单字段、"每页条数"、视图切换
//
//   `FilterSelect`  值是**可选的加法**、大部分时候不填 → 未选中时只占标题那么宽
//                   典型：列表页的筛选条件
//
// 一句话：**下拉框在问"你选哪个"，chip 在说"要不要加个条件"**。
//
// ── 为什么值得单独一个组件 ────────────────────────────────────────────────
// 筛选区常有五六个条件，用固定宽度的下拉框排一行的话：
//
//   · 每个都占 176px（`w-44`），五个就是 880px，一行放不下要换行
//   · 未选中时它们长得和选中的一模一样，扫一眼看不出**当前筛了什么**
//
// chip 形态两条都解决：未选中只占标题宽度（「状态」两个字），一行能放下更多；
// 选中后右侧多出值，一眼就能数出加了几个条件。**虚线**是这一族的记号 ——
// 它表达"这里还可以加东西"，与实线的确定态区分开（同 shadcn 的 faceted filter）。
//
// ── 引擎是复用的 ─────────────────────────────────────────────────────────
// 面板（搜索 / 勾选 / 计数 / 全选）**完全走 `SelectCombobox`**，只经 `renderTrigger`
// 换掉触发器。自己实现一遍那份面板，等于把同一套交互复制成两份，迟早漂移。

import { CirclePlus, SquarePlus, X } from "lucide-react"
import { cn } from "../utils"
import { Badge } from "./ui/badge"
import { SelectCombobox, type SelectComboboxOption } from "./select-combobox"
import { useUiT } from "../i18n/index"

export type FilterSelectOption = SelectComboboxOption

export interface FilterSelectProps {
  /** chip 上的标题，也是面板搜索框的 placeholder。写维度名（「状态」「来源」）。 */
  title: string
  options: FilterSelectOption[]
  /** 单选值。与 `values` 二选一。 */
  value?: string
  onValueChange?: (value: string) => void
  /** 多选。 */
  multiple?: boolean
  values?: string[]
  onValuesChange?: (values: string[]) => void
  /**
   * 芯片里最多平铺几个选中项，多出来的折成「+N」。默认 1（LF 2026-09-07）。
   *
   * 多选下每个平铺的项自带 ×，可以单独摘掉；「+N」只是计数，展开的细节交给点开面板看。
   * 此前超过上限时整个折成「N 项」——连第一个选了什么都看不见，扫一眼读不出筛的是什么。
   */
  maxDisplay?: number
  /**
   * 面板里的搜索框。**默认不开**。
   *
   * 筛选维度的候选集通常就那么几项（状态 5 个、环境 2 个），加个搜索框反而多一行、
   * 多一次「要不要在这打字」的判断。选项确实多（集群、工作空间这类几十上百）时才传 true。
   */
  searchable?: boolean
  /**
   * 全选行。**多选时默认开**，单选无意义（自动忽略）。
   *
   * 多选筛选常见的意图是「先全选，再排除一两个」—— 没有全选就得逐个点，
   * 五项以上很难受。作用域是当前可见列表（配 `searchable` 时即搜索结果）。
   */
  selectAll?: boolean | string
  disabled?: boolean
  className?: string
}

/**
 * @example
 * ```tsx
 * <FilterSelect
 *   title="状态"
 *   multiple
 *   options={STATUSES.map(s => ({ value: s, label: s }))}
 *   values={query.status}
 *   onValuesChange={(v) => setQuery({ ...query, status: v })}
 * />
 * ```
 */
export function FilterSelect({
  title,
  options,
  value,
  onValueChange,
  multiple,
  values,
  onValuesChange,
  maxDisplay = 1,
  searchable,
  selectAll,
  disabled,
  className,
}: FilterSelectProps) {
  const t = useUiT()
  return (
    <SelectCombobox
      options={options}
      value={value}
      onValueChange={onValueChange}
      multiple={multiple}
      values={values}
      onValuesChange={onValuesChange}
      // ⚠️ `SelectCombobox` 的 `searchable` **默认是 true** —— 不显式传 false
      // 就会一直带着搜索框（LF 截图抓到）。本组件的默认相反：筛选维度通常就几项。
      searchable={searchable ?? false}
      searchPlaceholder={title}
      // 多选默认给全选行；单选下 SelectCombobox 自己会忽略它
      selectAll={multiple ? (selectAll ?? true) : undefined}
      disabled={disabled}
      // 面板宽度跟内容走，不跟 chip —— chip 只有标题那么宽（「状态」两个字约 60px），
      // 面板跟着它就没法读了。
      popupWidth="content"
      renderTrigger={({ selectedOptions, clear, disabled: isDisabled }) => (
        <button
          type="button"
          disabled={isDisabled}
          className={cn(
            // 虚线是这一族的记号：**表达"这里还可以加东西"**，与实线的确定态分开。
            // 高度对齐 `h-8` —— 筛选区里它和 Input / DataSelect 并排。
            "inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-input bg-background px-3 text-sm whitespace-nowrap",
            "focus:outline-hidden focus-within:border-ring",
            isDisabled
              ? "cursor-not-allowed opacity-50"
              : "cursor-pointer not-focus-within:hover:border-ring/40",
            className
          )}
        >
          {/*
            ── 图标分两档：圆 = 单选，方 = 多选 ──────────────────────────────
            两者都是「加一个筛选条件」，真正的差别是**能加几个**。用圆 / 方区分是
            因为它**沿用了表单里已有的语言**：`RadioGroup` 是圆点、`Checkbox` 是方框。
            用户不用学新记号 —— 看到方的就知道这一条能多选。

            用同一个图标的话，"这个筛选能不能选多个"要点开面板才知道
            （面板里圆点 / 勾选框是分开的，但那已经晚了一步）。
          */}
          {multiple ? (
            <SquarePlus className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <CirclePlus className="size-4 shrink-0 text-muted-foreground" />
          )}
          {/* 未选中时维度名退到次级色：它此刻是「这里还可以加条件」的占位，不是已生效的
              信息；选中后转正（foreground），与后面的值一起成为一条筛选。 */}
          <span className={cn("font-medium", selectedOptions.length === 0 && "text-muted-foreground")}>
            {title}
          </span>
          {selectedOptions.length > 0 && (
            <>
              {/* 竖线分隔"维度名"和"选了什么" —— 两者是不同性质的信息，
                  紧挨着会读成一句话（「状态运行中」）。 */}
              <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />
              {/* 平铺前 maxDisplay 个；多选下每个带自己的 ×（摘掉这一项，不动其它） */}
              {selectedOptions.slice(0, maxDisplay).map((o) => (
                <Badge
                  key={o.value}
                  variant="secondary"
                  className="gap-1 rounded-sm px-1.5"
                >
                  {o.label}
                  {multiple && onValuesChange && (
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label={t("shared.remove", { label: o.label })}
                      onClick={(e) => {
                        e.stopPropagation()
                        onValuesChange((values ?? []).filter((v) => v !== o.value))
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return
                        e.stopPropagation()
                        e.preventDefault()
                        onValuesChange((values ?? []).filter((v) => v !== o.value))
                      }}
                      className="-mr-0.5 flex size-4 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted-foreground/15 hover:text-foreground"
                    >
                      <X className="size-3" />
                    </span>
                  )}
                </Badge>
              ))}
              {selectedOptions.length > maxDisplay && (
                <Badge variant="secondary" className="rounded-sm px-1.5">
                  +{selectedOptions.length - maxDisplay}
                </Badge>
              )}
              {/*
                清除全部。**单选必须有它** —— 单选点同项只会关掉面板，选中的值没有出口
                （LF 实测卡在这）。多选下平铺的项各自带 ×，这个只在有「+N」折叠时出现
                （折叠掉的那些没有别的出口）。
                `role="button"` 而不是嵌套 `<button>`：外层已经是按钮，
                按钮套按钮在 HTML 里非法（浏览器会把内层拎出来，事件绑定跟着错位）。
                `stopPropagation` 拦住冒泡，否则点它会顺手展开面板。
              */}
              {(!multiple || selectedOptions.length > maxDisplay) && (
              <span
                role="button"
                tabIndex={-1}
                aria-label={t("filterSelect.clear", { title })}
                onClick={(e) => {
                  e.stopPropagation()
                  clear()
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return
                  e.stopPropagation()
                  e.preventDefault()
                  clear()
                }}
                className="-mr-1 ml-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </span>
              )}
            </>
          )}
        </button>
      )}
    />
  )
}
