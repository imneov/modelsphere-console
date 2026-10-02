"use client"

/**
 * `Select` —— 平台下拉的**唯一推荐入口**（一行用，AntD 式心智）。
 *
 * ```tsx
 * <Select options={opts} value={v} onValueChange={setV} />                 // 固定枚举
 * <Select options={opts} searchable onSearch={q => refetch(q)} … />        // 远程搜索
 * <Select options={opts} multiple values={vs} onValuesChange={setVs} />    // 多选
 * ```
 *
 * **门面 + 双引擎**：使用者只见一个组件，内部按 props 路由 ——
 *
 *   - 纯枚举形态（无任何数据型 props）→ Base UI Select 引擎（原生级表单语义/无障碍）
 *   - 出现 searchable / multiple / onSearch / onLoadMore / clearable / loading
 *     任一 → combobox 引擎（select-combobox.tsx：搜索、滚动分页、多选、clearable）
 *
 * 为什么不做成一个大组件：AntD 单组件路线的组合爆炸（50+ props 两两交互）需要
 * rc-select 级别的维护投入；双引擎把复杂度拦在路由边界上，每个引擎各自保持简单。
 *
 * **props 白名单纪律**：本门面只收中性能力。tags / labelInValue / 自由输入等
 * AntD 式膨胀一律拒收；「数据从哪来」（workspace/镜像/资源池…）的业务语义归
 * `@theriseunion/components` 的业务选择器（= 数据获取 + 组装本组件）。
 *
 * 深度定制（自定义 trigger、分组 SelectGroup、嵌进复杂表单布局）请用组合式积木：
 * `Select` + `SelectTrigger` + `SelectContent` + `SelectItem`。
 */

import * as React from "react"
import { cn } from "../utils"
import { SelectEmpty } from "./select-empty"
import { SelectOptionContent } from "./select-option-content"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./ui/select"
import {
  SelectCombobox,
  type SelectComboboxOption,
} from "./select-combobox"
import { useUiT } from "../i18n/index"

// ─── Types ───────────────────────────────────────────────────────────────────

/** 平台下拉选项的标准形状。业务数据在调用侧映射成它，不要反向渗透。 */
export type DataSelectOption = SelectComboboxOption

export interface DataSelectProps<T extends DataSelectOption = DataSelectOption> {
  /**
   * 选项列表。value 不可为空字符串，空值用 placeholder 表达。
   *
   * 归因更正（底座已从 Radix 换到 Base UI，rise-global#104）：这条限制现在来自
   * Base UI 的 Select —— 空串会被当成「未选中」，与真正选了一个空值分不开。
   * 另需注意 Base UI 的清空语义与 Radix 不同：`onValueChange` 在清空时回传
   * **null** 而不是空串（见 freeland#21 第七节，console 侧为此改过 33 处）。
   */
  /**
   * 选项。收 `readonly` —— 页面里的选项常量大多写成 `as const`（元组 + readonly），
   * 那正是我们希望的写法（值被钉死、能推出联合类型）。收 `T[]` 会逼每个调用点
   * 写一次 `[...OPTIONS]` 把只读性丢掉，纯粹是类型噪声。
   */
  options: readonly T[]
  /** id of the trigger, so a `<Label htmlFor>` can point at it. */
  id?: string
  /** 单选值。 */
  value?: string
  onValueChange?: (value: string) => void
  /** 多选（自动启用 combobox 引擎）。 */
  multiple?: boolean
  values?: string[]
  onValuesChange?: (values: string[]) => void
  /**
   * 多选全选行（仅 multiple 生效）。true = 默认文案「全选」，string = 自定义。
   * 远程分页未加载完（hasMore）时勾选框停留半选态并旁注「仅全选已加载」，
   * 打勾只出现在全集确实已选中时——勾选框不撒谎。
   */
  selectAll?: boolean | string
  /**
   * 触发器上的维度名，渲染成「`label`: 值」（如 `排序: 趋势`）。
   *
   * 给**筛选区**用：一排并列的下拉只显示值时，看不出哪个是哪个维度（「趋势」是排序档
   * 还是别的什么？）。维度名走次级色、值走前景色，视线仍落在「选了什么」上。
   *
   * 未选中时只显示 `placeholder`，不拼维度名 —— 否则「量化」这类维度名与占位文案
   * 相同的场合会渲染成「量化: 量化」。
   *
   * 表单字段**不要用它**：那里的维度名归 `FieldLabel`，框里再写一遍是重复。
   */
  label?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  width?: string | number
  /** 搜索框（自动启用 combobox 引擎）。 */
  searchable?: boolean
  searchPlaceholder?: string
  /** 本地过滤器（searchable 且未提供 onSearch 时生效）。 */
  filterOption?: (input: string, option: T) => boolean
  /** 远程搜索（自动启用 combobox 引擎；内部防抖）。 */
  onSearch?: (query: string) => void
  /** 滚动分页（自动启用 combobox 引擎）。 */
  onLoadMore?: () => void
  hasMore?: boolean
  loading?: boolean
  /** 清空按钮（自动启用 combobox 引擎；Select 引擎无法表达"清空"）。 */
  clearable?: boolean
  /** 自定义选项渲染（仅 combobox 引擎生效）。 */
  /**
   * 整行自由渲染。**逃生口，不是首选** ——
   * 绝大多数「带副行的选项」用 `description` / `badge` 两个字段就够，
   * 排版由组件定死，各页面才不会长出七八种字号和间距。
   * 只有真需要异形（小卡片、进度条、缩略图）时才用它。
   */
  renderOption?: (option: T, isSelected: boolean) => React.ReactNode
  /**
   * 弹层宽度。默认 `anchor`：不窄于触发器，按最长选项撑宽，上限为视口可用宽度，超出才截断。
   * `content`：不锚触发器，按最长选项撑宽（下限 `min-w-40`、上限 32rem），给宽度随选中值变化的
   * 芯片触发器（`FilterSelect` / `ScopeFilter`）用 —— 锚上去的话每选一次弹层跟着抖一下。
   * 两档都不折行：一个选项两行会让列表高度乱跳。
   */
  popupWidth?: "anchor" | "content"
  /**
   * 列表本来就空时的标题。默认「暂无可选项」。
   * @deprecated 用 `emptyTitle`
   */
  emptyText?: string
  /** 列表本来就空时的标题。默认「暂无可选项」 */
  emptyTitle?: string
  /** 补一句为什么空 / 下一步做什么 */
  emptyDescription?: string
  /**
   * 空态里的动作，通常是 `Button`（「去镜像服务创建」这类）。
   * **点它会先关浮层再执行**，调用方不要自己再关一遍。
   */
  emptyAction?: React.ReactNode
  /** 搜过但没匹配到时的标题。默认「无匹配结果」 */
  emptyFilteredTitle?: string
  loadingText?: string
  noMoreText?: string
  debounceMs?: number
  /** 浮层打开回调（常用于首次打开才拉数据）。 */
  onOpen?: () => void
  /** 选中对钩位置，两个引擎统一生效。默认 left（shadcn 传统）；right=对钩靠最右。 */
  checkAlign?: "left" | "right"
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DataSelect<T extends DataSelectOption = DataSelectOption>(props: DataSelectProps<T>) {
  const {
    options,
    id,
    value,
    onValueChange,
    multiple,
    label,
    placeholder,
    disabled,
    className,
    width,
    searchable,
    onSearch,
    onLoadMore,
    clearable,
    loading,
    renderOption,
    popupWidth = "anchor",
    emptyText,
    emptyTitle,
    emptyDescription,
    emptyAction,
    onOpen,
    checkAlign = "right",
  } = props

  const t = useUiT()
  // 两个引擎（combobox / 原生 Select）都不认识"未传"以外的中文默认值，这里统一解析一次，
  // 显式传空串 / null 时不回落，仅 undefined（调用方未传）才取词表
  const placeholderText = placeholder === undefined ? t("shared.selectPlaceholder") : placeholder

  // 路由规则：出现任何**数据型**能力 → combobox 引擎；否则 Base UI Select 引擎。
  // clearable 显式传 true 也走 combobox（Base UI Select 没有"清空"这个概念）。
  //
  // ⚠️ `renderOption` **不属于这个列表**：
  // 它是**渲染**能力，不是数据能力。放进来的后果是"只想让选项多一行字，引擎被
  // 静默换掉了" —— 键盘行为、弹层实现、触发器显示全跟着变，而 API 上完全看不出来。
  // 选项长什么样和要不要搜索是**正交**的两件事，不该互相触发。
  const needsCombobox =
    !!multiple || !!searchable || !!onSearch || !!onLoadMore || !!clearable || !!loading

  if (needsCombobox) {
    return (
      <SelectCombobox<T>
        {...props}
        // 搜索框的显隐推导：显式指定 > 隐含需要。远程搜索(onSearch)/本地过滤
        // (filterOption)没有输入框就没意义，必须默认亮；其余场景(纯多选、纯
        // clearable、纯分页)默认不出搜索框。
        searchable={searchable ?? (!!onSearch || !!props.filterOption)}
        clearable={clearable ?? false}
        placeholder={placeholderText}
      />
    )
  }

  // ── Select 引擎（Base UI）：固定枚举 ──
  return (
    <Select
      value={value || undefined}
      // `items` 不能省：Base UI 的 Select.Value 靠它把 value 映射成 label，
      // 不传就**直接渲染 value 本身** —— 表现为触发器上显示 `modelscope` 而不是
      // `ModelScope`、显示哨兵值 `__all__` 而不是「全部」。
      // 这是 Radix 时代没有的差异（Radix 的 SelectValue 从选中的 Item 取 children）。
      // 只映射 label：Base UI 的 SelectValue 用它渲染触发器，
      // **触发器永远只显示一行** —— description / badge 只属于弹层
      items={options.map((o) => ({ value: o.value, label: o.label }))}
      onValueChange={(v) => onValueChange?.(v ?? "")}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        // `w-full`：与 combobox 引擎的触发器（select-combobox.tsx，`w-full min-w-[120px]`）
        // 口径一致。shadcn 原件 SelectTrigger 是 `w-fit`，于是同一个 DataSelect 门面
        // 传不传 clearable/searchable 宽度行为就不一样 —— 表单里纯枚举的下拉缩成
        // 「请选择 ▾」一小块，旁边的 Input 却是通栏（demo「调度策略」就是这么露馅的；
        // 它外面为了提交后聚焦包了层 div，Field 的 `*:w-full` 落在 div 上、进不到触发器）。
        // 工具栏里要定宽的调用点本来就显式传 `className="w-52"` / `width`，
        // 经 tailwind-merge 覆盖 `w-full`，不受影响。
        className={cn("w-full min-w-[120px]", className)}
        style={width ? { width } : undefined}
        onClick={onOpen ? () => onOpen() : undefined}
      >
        {/* 维度名只在有值时出现：没选时 placeholder 自己就说明了是什么 */}
        {label && value ? (
          <span className="shrink-0 text-muted-foreground">{label}:</span>
        ) : null}
        <SelectValue placeholder={placeholderText} />
      </SelectTrigger>
      <SelectContent
        // 口径与 combobox 引擎一致。下限必须写成 `min-w-[var(--anchor-width)]`：tailwind-merge 2.x
        // 不认 v4 的 `min-w-(--x)` 简写，去不掉 `SelectContent` 自带的 `min-w-36`，按 CSS 顺序后者胜出
        className={popupWidth === "content" ? "w-max min-w-40 max-w-[32rem]" : "w-max min-w-[var(--anchor-width)] max-w-[var(--available-width)]"}
        /*
          空态走 `empty` 插槽，**不能混进 children** —— children 会被塞进
          `Select.List`（listbox），里面只该有 `Select.Item`，塞普通节点进去会参与
          它的选项注册与键盘导航。这条路径没有搜索框，所以永远是「列表本来就空」那档。
        */
        empty={options.length === 0 ? (
          <SelectEmpty
            title={emptyTitle ?? emptyText}
            description={emptyDescription}
            action={emptyAction}
          />
        ) : undefined}
      >
        {/*
          选项行的呈现（内边距、行距、圆角、悬停底色、选中主色）全部由 `SelectItem` /
          `SelectContent` 自己定 —— 见 ui/select.tsx 文件头第 4 条。这里不再补样式：
          补在调用点，直接用 `Select` 积木的页面就跟 `DataSelect` 长得不一样（LF 2026-09-14）。
        */}
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled} checkAlign={checkAlign}>
            {/* 与 combobox 引擎共用同一件 —— 同一份选项数据，两条路显示必须一致 */}
            {renderOption ? (
              renderOption(opt, opt.value === value)
            ) : (
              <SelectOptionContent
                label={opt.label}
                icon={opt.icon}
                badge={opt.badge}
                description={opt.description}
              />
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
