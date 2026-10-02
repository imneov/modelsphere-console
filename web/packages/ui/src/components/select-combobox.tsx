"use client"

/**
 * combobox 引擎 —— `Select` 门面（select.tsx）的数据型下拉实现体。
 *
 * ⚠️ 本组件**不再从包入口导出**：公共 API 只有门面 `Select`（一行用）与
 * `SelectRoot` 积木（深度定制）。门面在出现 searchable / multiple / onSearch /
 * onLoadMore / clearable / loading 任一数据型 props 时路由到这里。
 *
 * **底座是 Base UI 的 Combobox 原语**（早前是 Radix Popover + 手搓
 * 键盘/ARIA）。Portal/碰撞定位、↑↓/Home/End/Enter/Esc、combobox ARIA、高亮跟随滚动
 * 全部来自原语。本层保留的是**数据语义**：本地/远程双模（远程时 filter={null}，
 * 过滤权在父方）、滚动分页、全选行（含「仅全选已加载」半选语义）、renderOption、
 * checkAlign、清空。items 传 value 字符串、过滤自算 —— 为了让 filterOption 拿到
 * 完整 option 对象（Base UI 内置过滤只见字符串）。
 *
 * 能力面与旧版兼容：本地/远程搜索双模、滚动分页（onLoadMore/hasMore/loading）、
 * clearable、renderOption、icon/disabled 选项；新增 multiple 多选。
 */

import * as React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { ChevronDown, Check, X, Search } from "lucide-react"

import { Spinner } from "./spinner"
import { Checkbox } from "./ui/checkbox"
import { cn } from "../utils"
import { SelectEmpty } from "./select-empty"
import { SelectOptionContent } from "./select-option-content"
import { useUiT, useUiLocale, formatList } from "../i18n/index"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SelectComboboxOption {
  value: string
  label: string
  /** Optional icon rendered on the left of the option (and the selected value). */
  icon?: React.ReactNode
  /**
   * 副行。写「·」连接的事实串（`Qwen2.5-7B · A100 80G × 2 · 6/6 副本`），不写句子。
   *
   * ⚠️ **只在弹层里显示，触发器永远只显示 `label`**。触发器高度是固定的，
   * 塞两行会撑破；而且它回答的是「选了哪个」，不需要复述细节。
   */
  description?: string
  /** 标题右侧的标记（状态 / 版本 / 类型）。同样只在弹层里显示 */
  badge?: React.ReactNode
  /** Disable selecting this option. */
  disabled?: boolean
}

export interface SelectComboboxProps<T extends SelectComboboxOption = SelectComboboxOption> {
  /** id of the trigger, for `<Label htmlFor>`. */
  id?: string
  /** 单选值。multiple 时忽略，用 values。 */
  value?: string
  onValueChange?: (value: string) => void
  /** 多选。开启后 trigger 显示已选摘要，点选项不关闭浮层。 */
  multiple?: boolean
  /** 多选值。 */
  values?: string[]
  onValuesChange?: (values: string[]) => void
  /**
   * 自定义触发器。**逃生口，不是首选。**
   *
   * 默认触发器是一个和 `Input` / `SelectTrigger` 等高的下拉框 —— 那是表单和筛选区里
   * 的标准形态，99% 的场景不该动它。
   *
   * 开这个口子是因为**存在触发器形态完全不同、而面板逻辑一模一样**的情况：
   * `FilterSelect`（虚线 chip + ⊕，未选中时只占标题宽度）就是一例。让它自己实现
   * 一遍搜索 / 勾选 / 计数，等于把这份面板复制成两份，迟早漂移。
   *
   * 传了它之后**触发器的一切都归调用方**（尺寸、底色、焦点环、清空按钮、
   * 展开箭头都不再由本组件画）。所以只在"形态真的不一样"时用；
   * 只是想改个宽度或底色的话，用 `className` / `width`。
   */
  renderTrigger?: (state: {
    /** 当前选中的选项（单选）。 */
    selected?: T
    /** 当前选中的全部选项（多选；单选时是 0 或 1 个）。 */
    selectedOptions: T[]
    /** 浮层开着没有。 */
    open: boolean
    /** 清空当前选择。 */
    clear: () => void
    disabled?: boolean
  }) => React.ReactNode
  /**
   * 多选时在列表顶部显示全选行（true = 默认文案「全选」，string = 自定义文案）。
   * 语义诚实原则：勾选框打勾 = 全集已选。远程分页未加载完（hasMore）时全选后
   * 停留在半选态并旁注「仅全选已加载」——「已加载」即当前可见列表（含过滤后）。
   */
  selectAll?: boolean | string
  /**
   * 选项。收 `readonly` —— 页面里的选项常量大多写成 `as const`（元组 + readonly），
   * 那正是我们希望的写法（值被钉死、能推出联合类型）。收 `T[]` 会逼每个调用点
   * 写一次 `[...OPTIONS]` 把只读性丢掉，纯粹是类型噪声。
   */
  options: readonly T[]
  /** 触发器上的维度名，渲染成「`label`: 值」。语义与用法见 `DataSelect` 的同名属性。 */
  label?: string
  placeholder?: string
  searchPlaceholder?: string
  className?: string
  /** 选项加载中（远程模式由父方控制；也用于滚动分页的请求间隙）。 */
  loading?: boolean
  /** 滚动分页：是否还有下一页。 */
  hasMore?: boolean
  /** 显示搜索框。小型固定枚举可关掉（纯样式下拉）。默认 true。 */
  searchable?: boolean
  disabled?: boolean
  /** 本地过滤器；仅在未提供 onSearch（本地模式）时生效。默认 label 不区分大小写包含。 */
  filterOption?: (input: string, option: T) => boolean
  /** 远程搜索回调（内部已防抖）。提供即切换为远程模式，父方负责返回过滤后的 options。 */
  onSearch?: (query: string) => void
  /** 滚动到底回调（配合 hasMore/loading 组成滚动分页）。 */
  onLoadMore?: () => void
  renderOption?: (option: T, isSelected: boolean) => React.ReactNode
  /**
   * 弹层宽度。默认 `anchor`：不窄于触发器，按最长选项撑宽，上限为视口可用宽度，超出才截断。
   * `content`：不锚触发器，按最长选项撑宽（下限 `min-w-40`、上限 32rem），给宽度随选中值变化的
   * 芯片触发器（`FilterSelect` / `ScopeFilter`）用 —— 锚上去的话每选一次弹层跟着抖一下。
   */
  popupWidth?: "anchor" | "content"
  /** 显示清空按钮（单选清成 ''，多选清成 []）。默认 true。 */
  clearable?: boolean
  /**
   * 列表本来就空时的标题。默认「暂无可选项」。
   * @deprecated 用 `emptyTitle` —— 名字与 `ResourceTable` 的空态三件套对齐
   */
  emptyText?: string
  /** 列表本来就空时的标题。默认「暂无可选项」 */
  emptyTitle?: string
  /** 补一句为什么空 / 下一步做什么 */
  emptyDescription?: string
  /** 空态里的动作，通常是 `Button`。**只在列表本来就空时渲染**，搜不到时不摆 */
  emptyAction?: React.ReactNode
  /** 搜过但没匹配到时的标题。默认「无匹配结果」—— 与上面那档是两件事 */
  emptyFilteredTitle?: string
  loadingText?: string
  noMoreText?: string
  /** 远程搜索防抖毫秒数。默认 300。 */
  debounceMs?: number
  /** 浮层打开回调（常用于首次打开才拉数据）。 */
  onOpen?: () => void
  width?: string | number
  /** 选中对钩位置。与 Radix 引擎的 SelectItem 同名同义，门面统一透传。默认 left。 */
  checkAlign?: "left" | "right"
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SelectCombobox<T extends SelectComboboxOption = SelectComboboxOption>({
  id,
  value = "",
  onValueChange,
  multiple = false,
  values = [],
  selectAll,
  onValuesChange,
  options,
  label,
  placeholder,
  searchPlaceholder,
  className,
  renderTrigger,
  loading = false,
  hasMore = false,
  searchable = true,
  disabled = false,
  filterOption,
  onSearch,
  onLoadMore,
  renderOption,
  popupWidth = "anchor",
  clearable = true,
  emptyText,
  emptyTitle,
  emptyDescription,
  emptyAction,
  emptyFilteredTitle,
  loadingText,
  noMoreText,
  debounceMs = 300,
  onOpen,
  width,
  checkAlign = "right",
}: SelectComboboxProps<T>) {
  const t = useUiT()
  const lng = useUiLocale()
  // 显式传空串 / null 时不回落默认文案，仅 undefined（调用方未传）才取词表
  const placeholderResolved = placeholder === undefined ? t("shared.selectPlaceholder") : placeholder
  const searchPlaceholderResolved = searchPlaceholder === undefined ? t("shared.searchPlaceholder") : searchPlaceholder
  const emptyFilteredTitleResolved = emptyFilteredTitle === undefined ? t("selectCombobox.noMatch") : emptyFilteredTitle
  const loadingTextResolved = loadingText === undefined ? t("shared.loading") : loadingText
  const noMoreTextResolved = noMoreText === undefined ? t("selectCombobox.noMore") : noMoreText
  const [open, setOpen] = useState(false)
  /*
    「现在是键盘在走」——只有它为真时，引擎给的 `data-highlighted` 才画底色。

    为什么需要这个开关：弹层一打开，引擎就把高亮落在选中项上（键盘要从那儿接着走）。
    直接给 `data-highlighted` 画底色，就是「关掉再打开，选中那行凭空多出一块底色」
    （LF 2026-09-14）。而鼠标那一路不靠它 —— 用 `hover` 画，每一行都吃，包括选中行。

    方向键 / Home / End 打开开关，鼠标一动就关掉：谁最后动，底色就跟谁。
  */
  const [kbdNav, setKbdNav] = useState(false)
  useEffect(() => { if (!open) setKbdNav(false) }, [open])
  const [query, setQuery] = useState("")
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const isRemote = !!onSearch

  // ── 远程搜索防抖 ──
  useEffect(() => {
    if (!open || !isRemote) return
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      if (open) onSearch!(query.trim())
    }, debounceMs)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open])

  // ── 本地过滤（远程模式下父方已过滤，原样展示）──
  const displayed = React.useMemo(() => {
    if (!searchable || isRemote || !query.trim()) return options
    const q = query.trim()
    const f =
      filterOption ??
      ((input: string, opt: T) => opt.label.toLowerCase().includes(input.toLowerCase()))
    return options.filter((opt) => f(q, opt))
  }, [options, searchable, isRemote, query, filterOption])

  const byValue = React.useMemo(() => {
    const m = new Map<string, T>()
    for (const o of options) m.set(o.value, o)
    return m
  }, [options])

  // ── 滚动分页 ──
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (!onLoadMore || !hasMore || loading) return
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
      if (scrollHeight - scrollTop <= clientHeight + 5) onLoadMore()
    },
    [hasMore, loading, onLoadMore]
  )

  const isSelected = useCallback(
    (v: string) => (multiple ? values.includes(v) : value === v),
    [multiple, values, value]
  )

  // ── 全选（仅 multiple）——语义同前：作用域 = 当前可见列表排除 disabled ──
  const selectableValues = React.useMemo(
    () => displayed.filter((o) => !o.disabled).map((o) => o.value),
    [displayed]
  )
  const selectedVisibleCount = selectableValues.filter((v) => values.includes(v)).length
  const allVisibleSelected =
    selectableValues.length > 0 && selectedVisibleCount === selectableValues.length

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      onValuesChange?.(values.filter((v) => !selectableValues.includes(v)))
    } else {
      onValuesChange?.(Array.from(new Set([...values, ...selectableValues])))
    }
  }

  const clear = (e?: React.MouseEvent) => {
    // 事件可选：默认触发器里它是 X 按钮的 onClick（要拦冒泡，否则会顺手展开浮层），
    // 而 `renderTrigger` 的调用方可能在别处调用它、手上没有事件对象。
    e?.stopPropagation()
    if (multiple) onValuesChange?.([])
    else onValueChange?.("")
  }

  const handleOpenChange = (next: boolean) => {
    if (disabled) return
    setOpen(next)
    if (next) onOpen?.()
    else setQuery("")
  }

  // ── trigger 展示文案 ──
  const selectedOption = byValue.get(value)
  const triggerText = multiple
    ? values.length === 0
      ? placeholderResolved
      : values.length <= 2
        ? formatList(values.map((v) => byValue.get(v)?.label ?? v), lng)
        : t("shared.selectedCount", { n: values.length })
    : selectedOption?.label || value || placeholderResolved
  const hasSelection = multiple ? values.length > 0 : !!value
  const showClear = clearable && hasSelection && !disabled

  /*
    **首次拉候选时不让点开** —— 点开只看到一句「加载中…」，是一次没有意义的交互；
    框里的转圈已经把「在等」说清楚了。加载完无论有没有候选都放开：没有候选是要
    让人点开看空态的（`SelectEmpty` 可能挂着「去创建」按钮）。

    只认**首次**：`loading` 还兼着滚动分页（onLoadMore/hasMore/loading），那时浮层
    本来就开着、列表里已经有内容，禁用触发器会把开着的浮层顶掉。
  */
  const initialLoading = loading && options.length === 0
  const triggerDisabled = disabled || initialLoading

  return (
    <ComboboxPrimitive.Root
      open={open}
      onOpenChange={handleOpenChange}
      multiple={multiple as never /* Base UI 的 Multiple 泛型与联合受控值不好合一，值由下方受控分支给 */}
      items={displayed.map((o) => o.value)}
      // 过滤自算（displayed），原语内置过滤关掉 —— filterOption 要拿完整 option 对象
      filter={null}
      value={(multiple ? values : value || null) as never}
      onValueChange={(v: unknown) => {
        if (multiple) onValuesChange?.((v as string[]) ?? [])
        else {
          onValueChange?.((v as string | null) ?? "")
          setOpen(false)
        }
      }}
      inputValue={query}
      onInputValueChange={(q: string) => setQuery(q)}
      disabled={disabled}
    >
      <ComboboxPrimitive.Trigger
        id={id}
        disabled={triggerDisabled}
        render={
          renderTrigger ? (
            // 调用方接管整个触发器 —— 它必须自己渲染成一个可聚焦元素，
            // Base UI 的 Trigger 会把交互属性合并上去。
            (renderTrigger({
              selected: selectedOption,
              selectedOptions: options.filter((o) =>
                multiple ? (values ?? []).includes(o.value) : o.value === value
              ),
              open,
              clear,
              disabled: triggerDisabled,
            }) as React.ReactElement)
          ) : (
          <button
            type="button"
            className={cn(
              // 与 ui/select 的 SelectTrigger、ui/input 的 Input 保持**同一高度**。
              //
              // 原值是 h-10，注释还写着「同一尺寸基准」—— 那是 Radix 时代的事实。
              // 切 Base UI 后 shadcn 把 Input 和 SelectTrigger 都降到了 h-8，
              // 这边没跟，于是 DataSelect 的两个引擎高度差了一档：同一排筛选里，
              // 纯枚举的下拉 32px、带 clearable/搜索的下拉 40px，参差不齐。
              //
              // 门面的意义就是**对外只有一个 DataSelect**，用户不该因为传了个
              // clearable 就看到高度跳变。所以这里对齐到 h-8，两个引擎口径统一。
              // 底色与其余表单控件完全一致：亮色 `bg-background`、暗色 `dark:bg-input/30`
              // （见 PATTERNS 的 surface token 表末条）。此前只有 `bg-background`，
              // 暗色下那是接近纯黑的画布色 —— 运行日志工具栏里 Pod 选择器比旁边的
              // 搜索框深一截就是它（2026-09-03 LF 截图指出，与 QuantityInput 同一个毛病）。
              "flex h-8 w-full min-w-[120px] items-center justify-between gap-1 rounded-md border border-input bg-background px-3 text-sm ring-offset-background dark:bg-input/30",
              "focus:outline-hidden focus-within:border-ring",
              triggerDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer not-focus-within:hover:border-ring/40",
              className
            )}
            style={width ? { width } : undefined}
            /*
              加载中把「在等什么」说出来。禁用的 button 仍然会弹原生 title
              （这里没有 `pointer-events-none`，所以 hover 收得到）。
              不用 Tooltip：那是给"要解释的语义"的，这里只是一个转瞬即逝的状态，
              挂一个受控浮层组件不划算，而且它在禁用元素上要额外包一层才收得到事件。
            */
            title={initialLoading ? t("selectCombobox.loadingData") : undefined}
          >
            <span
              className={cn(
                "flex flex-1 items-center gap-1.5 truncate text-left",
                !hasSelection && "text-muted-foreground"
              )}
              // 加载中让位给外层那句「正在加载数据」—— 内层 title 会盖掉外层，
              // 而此刻触发器上显示的还是 placeholder，重复它没有信息量
              title={!initialLoading && typeof triggerText === "string" ? triggerText : undefined}
            >
              {!multiple && selectedOption?.icon && (
                <span className="inline-flex shrink-0">{selectedOption.icon}</span>
              )}
              {/* 维度名只在有值时出现：没选时 placeholder 自己就说明了是什么。
                  外层 span 在无选中时整体转次级色，这里不必再判一次。 */}
              {label && hasSelection ? (
                <span className="shrink-0 text-muted-foreground">{label}:</span>
              ) : null}
              <span className="truncate">{triggerText}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {showClear && (
                <X
                  className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
                  onClick={clear}
                  aria-label={t("shared.clear")}
                />
              )}
              {/*
                候选还在路上时**框里就要看得出来** —— 只在浮层里写「加载中…」，
                用户得先点开才知道在等什么，而多数人看到一个空下拉会直接以为没有数据。
                箭头换成转圈：位置不动、不占额外宽度。首次加载期间触发器同时禁用
                （见上方 `initialLoading`）。
              */}
              {loading ? (
                <Spinner size="sm" className="text-muted-foreground" aria-label={t("selectCombobox.loadingOptions")} />
              ) : (
                <ChevronDown
                  className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
                />
              )}
            </span>
          </button>
          )
        }
      />

      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner align="start" sideOffset={4} className="isolate z-50">
          <ComboboxPrimitive.Popup
            onKeyDown={(e: React.KeyboardEvent) => {
              if (["ArrowDown", "ArrowUp", "Home", "End", "PageUp", "PageDown"].includes(e.key)) setKbdNav(true)
            }}
            onPointerMove={() => setKbdNav((v) => (v ? false : v))}
            /*
              默认档：下限 = 触发器宽（--anchor-width），按最长选项撑宽，上限 = 视口可用宽度
              （--available-width，均由 Positioner 注入）。选项文字是 `truncate`，max-content 就是全文宽，
              所以放得下就完整显示，放不下才截断。碰撞翻转由原语负责。

              `content` 档**不锚触发器宽度**：那些触发器（FilterSelect / ScopeFilter 的芯片）
              的宽度随选中的值变 —— 锚上去的话，选一个「Hugging Face」浮层就跟着变宽一截，
              取消再缩回去，每选一次抖一下。浮层该按自己的内容定宽。
              下限走固定的 `min-w-40`，与 DropdownMenu 那次同样的取舍（见该文件的本地补丁注释）。
            */
            //
            // 动画与 `SelectContent` **逐字对齐**：同一个 `DataSelect` 门面，
            // 加不加 searchable 走的引擎不同，弹层却不该一个有淡入缩放、一个"啪"地出现
            // —— 用户看到的是同一个下拉，两种出场方式只会读成"卡了一下"。
            className={cn(
              "w-max origin-(--transform-origin) rounded-md border border-border bg-popover text-popover-foreground shadow-md outline-hidden",
              popupWidth === "content" ? "min-w-40 max-w-[32rem]" : "min-w-(--anchor-width) max-w-(--available-width)",
              "duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
              "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
              "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
            )}
          >
            {searchable && (
              <div className="flex items-center gap-2 border-b border-border px-3">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <ComboboxPrimitive.Input
                  placeholder={searchPlaceholderResolved}
                  className="h-8 w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
                />
              </div>
            )}

            {multiple && selectAll && displayed.length > 0 && (
              // 放在滚动区之外：列表再长全选行也不滚走。勾选框语义：
              // ✓ = 全集已选（只有 !hasMore 才可能）；▬ = 选了一部分/仅已加载。
              <div
                role="checkbox"
                aria-checked={
                  allVisibleSelected && !hasMore
                    ? true
                    : selectedVisibleCount > 0
                      ? "mixed"
                      : false
                }
                onClick={toggleSelectAll}
                // 悬停底色与选项行同一档（LF 2026-09-14）：同一张弹层里两种深浅的灰会被读成两类控件
                className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                <Checkbox
                  aria-hidden
                  tabIndex={-1}
                  className="pointer-events-none"
                  checked={allVisibleSelected && !hasMore}
                  indeterminate={
                    !(allVisibleSelected && !hasMore) && selectedVisibleCount > 0
                  }
                />
                <span className="flex-1">
                  {typeof selectAll === "string" ? selectAll : t("shared.selectAll")}
                </span>
                {hasMore && (
                  <span className="text-xs text-muted-foreground/70">{t("selectCombobox.selectAllLoadedOnly")}</span>
                )}
              </div>
            )}

            <ComboboxPrimitive.List
              // gap-0.5：行与行之间留一线（LF 2026-09-14）。行有圆角和悬停底色，
              // 贴在一起时两块底色连成一条，读不出「这是几行」。
              className="flex max-h-60 flex-col gap-0.5 overflow-y-auto p-1 empty:hidden"
              onScroll={handleScroll}
            >
              {(v: string) => {
                const option = byValue.get(v)
                if (!option) return null
                const selected = isSelected(v)
                return (
                  <ComboboxPrimitive.Item
                    key={v}
                    value={v}
                    disabled={option.disabled}
                    /*
                      与 `SelectItem`（ui/select.tsx 文件头第 4 条）逐字同一套：
                      悬停 / 键盘高亮给底色，选中给**主色文字 + 主色对钩、不给底色**。
                      底色是「现在指着谁」，选中是「选了谁」—— 两件事抢同一个通道，
                      就会出现「鼠标划过别行之后，选中那行变淡」（LF 2026-09-14）。
                      多选另说：选中状态由行首的复选框表达，与「全选」那行同款。
                    */
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-sm",
                      // 字色一概不动（LF 2026-09-14 定死）：这一层只剩正常与禁用两个含义。
                      // 选中由对钩 / 复选框表达。
                      //
                      // 底色分两路（见 kbdNav 的注释）：鼠标走 `hover`，**每一行都吃、
                      // 包括选中行**；键盘走 `data-highlighted`，且只在键盘真的在走时才画。
                      "hover:bg-accent",
                      kbdNav && "data-highlighted:bg-accent",
                      // 禁用行**不吃悬停底色**：`pointer-events-none` 一刀切掉指针事件，
                      // 与 Select 引擎（上游的 `data-disabled:pointer-events-none`）同一套。
                      // 原来这边只降了透明度、没挡指针，于是禁用行照样亮底色，看着像能点
                      // （LF 2026-09-14 两张截图对比）。
                      option.disabled && "pointer-events-none opacity-50"
                    )}
                  >
                    {/* 左钩布局：固定宽度的对钩槽位，未选中也占位 —— 各行文本对齐。
                        `self-center`：行是 items-start（标题与副行左对齐），但对钩是**整行的状态**，
                        不属于标题那一行 —— 贴着首行会在两行选项里明显偏上（LF 2026-09-14）。 */}
                    {multiple ? (
                      <Checkbox
                        aria-hidden
                        tabIndex={-1}
                        className="pointer-events-none self-center"
                        checked={selected}
                      />
                    ) : checkAlign === "left" ? (
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center self-center">
                        {selected && <Check className="h-4 w-4" />}
                      </span>
                    ) : null}
                    <span className="flex min-w-0 flex-1">
                      {renderOption ? (
                        renderOption(option, selected)
                      ) : (
                        // 两个引擎共用这一件 —— 同一份选项数据，加不加 searchable
                        // 显示必须一样（原来 Select 那条写死一行，是静默降级）
                        <SelectOptionContent
                          label={option.label}
                          icon={option.icon}
                          badge={option.badge}
                          description={option.description}
                        />
                      )}
                    </span>
                    {!multiple && checkAlign === "right" && selected && (
                      <Check className="h-4 w-4 shrink-0 self-center" />
                    )}
                  </ComboboxPrimitive.Item>
                )
              }}
            </ComboboxPrimitive.List>

            {displayed.length === 0 && (
              loading ? (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">{loadingTextResolved}</div>
              ) : (
                <SelectEmpty
                  // 有搜索词 = 搜过但没匹配到；没搜索词 = 列表本来就空。两件事
                  filtered={!!query.trim()}
                  title={query.trim() ? emptyFilteredTitleResolved : (emptyTitle ?? emptyText)}
                  description={emptyDescription}
                  action={emptyAction}
                  onDismiss={() => setOpen(false)}
                />
              )
            )}
            {displayed.length > 0 && loading && (
              <div className="px-2 py-1.5 text-center text-sm text-muted-foreground">
                {loadingTextResolved}
              </div>
            )}
            {displayed.length > 1 && isRemote && !hasMore && !query.trim() && (
              <div className="px-2 py-1.5 text-center text-sm text-muted-foreground/60">
                {noMoreTextResolved}
              </div>
            )}
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  )
}
