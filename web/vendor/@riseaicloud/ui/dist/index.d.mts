import { ClassValue } from 'clsx';
import * as React$1 from 'react';
import React__default from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import * as react_jsx_runtime from 'react/jsx-runtime';
import * as class_variance_authority_types from 'class-variance-authority/types';
import * as class_variance_authority from 'class-variance-authority';
import { VariantProps } from 'class-variance-authority';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as TogglePrimitive from '@radix-ui/react-toggle';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Slot } from '@radix-ui/react-slot';
import { LucideIcon } from 'lucide-react';

/**
 * Merge Tailwind CSS classes with clsx
 */
declare function cn(...inputs: ClassValue[]): string;

declare const Separator: React$1.ForwardRefExoticComponent<Omit<SeparatorPrimitive.SeparatorProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;

declare const ScrollArea: React$1.ForwardRefExoticComponent<Omit<ScrollAreaPrimitive.ScrollAreaProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const ScrollBar: React$1.ForwardRefExoticComponent<Omit<ScrollAreaPrimitive.ScrollAreaScrollbarProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;

declare const Collapsible: React$1.ForwardRefExoticComponent<CollapsiblePrimitive.CollapsibleProps & React$1.RefAttributes<HTMLDivElement>>;
declare const CollapsibleTrigger: React$1.ForwardRefExoticComponent<CollapsiblePrimitive.CollapsibleTriggerProps & React$1.RefAttributes<HTMLButtonElement>>;
declare const CollapsibleContent: React$1.ForwardRefExoticComponent<CollapsiblePrimitive.CollapsibleContentProps & React$1.RefAttributes<HTMLDivElement>>;

interface PageHeaderProps {
    title: string;
    icon?: React__default.ReactNode;
    onBack?: () => void;
    extra?: React__default.ReactNode;
}
declare function PageHeader({ title, icon, onBack, extra }: PageHeaderProps): react_jsx_runtime.JSX.Element;

declare const buttonVariants: (props?: ({
    variant?: "link" | "default" | "destructive" | "outline" | "secondary" | "ghost" | null | undefined;
    size?: "default" | "icon" | "sm" | "lg" | null | undefined;
} & class_variance_authority_types.ClassProp) | undefined) => string;
interface ButtonProps extends React$1.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}
declare const Button: React$1.ForwardRefExoticComponent<ButtonProps & React$1.RefAttributes<HTMLButtonElement>>;

declare const badgeVariants: (props?: ({
    variant?: "default" | "destructive" | "outline" | "secondary" | null | undefined;
} & class_variance_authority_types.ClassProp) | undefined) => string;
interface BadgeProps extends React$1.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {
}
declare function Badge({ className, variant, ...props }: BadgeProps): react_jsx_runtime.JSX.Element;

declare const Avatar: React$1.ForwardRefExoticComponent<Omit<AvatarPrimitive.AvatarProps & React$1.RefAttributes<HTMLSpanElement>, "ref"> & React$1.RefAttributes<HTMLSpanElement>>;
declare const AvatarImage: React$1.ForwardRefExoticComponent<Omit<AvatarPrimitive.AvatarImageProps & React$1.RefAttributes<HTMLImageElement>, "ref"> & React$1.RefAttributes<HTMLImageElement>>;
declare const AvatarFallback: React$1.ForwardRefExoticComponent<Omit<AvatarPrimitive.AvatarFallbackProps & React$1.RefAttributes<HTMLSpanElement>, "ref"> & React$1.RefAttributes<HTMLSpanElement>>;

declare const Label: React$1.ForwardRefExoticComponent<Omit<LabelPrimitive.LabelProps & React$1.RefAttributes<HTMLLabelElement>, "ref"> & VariantProps<(props?: class_variance_authority_types.ClassProp | undefined) => string> & React$1.RefAttributes<HTMLLabelElement>>;

interface SearchableSelectOption {
    value: string;
    label: string;
    /** Optional icon rendered on the left of the option (and the selected value). */
    icon?: React$1.ReactNode;
    /** Disable selecting this option. */
    disabled?: boolean;
}
interface SearchableSelectProps<T extends SearchableSelectOption = SearchableSelectOption> {
    /** Current selected value */
    value: string;
    /** Callback when selection changes */
    onValueChange: (value: string) => void;
    /** Options to display */
    options: T[];
    /** Placeholder text when nothing is selected */
    placeholder?: string;
    /** Search placeholder text */
    searchPlaceholder?: string;
    /** Additional CSS classes */
    className?: string;
    /** Whether options are loading */
    loading?: boolean;
    /** Whether there are more items to load */
    hasMore?: boolean;
    /** Show the search input. Set false for small fixed-enum selects (styled
     *  dropdown, no search box). Default true. */
    searchable?: boolean;
    /** Disable the whole control. */
    disabled?: boolean;
    /**
     * Custom local filter. Only used for LOCAL search (i.e. when `onSearch` is not
     * provided). Return true to keep the option for the given input.
     * Default: case-insensitive match on `label`.
     */
    filterOption?: (input: string, option: T) => boolean;
    /** Callback when search query changes (debounced by parent). Providing this
     *  switches to REMOTE search — the parent returns the filtered `options`. */
    onSearch?: (query: string) => void;
    /** Callback when scroll reaches bottom */
    onLoadMore?: () => void;
    /** Custom render function for each option */
    renderOption?: (option: T, isSelected: boolean) => React$1.ReactNode;
    /** Whether to show a clear button */
    clearable?: boolean;
    /** Text shown when no results found */
    emptyText?: string;
    /** Text shown when loading */
    loadingText?: string;
    /** Text shown when all items are loaded */
    noMoreText?: string;
    /** Debounce delay in ms (default 300) */
    debounceMs?: number;
    /** Callback when dropdown opens */
    onOpen?: () => void;
    /** Width style */
    width?: string | number;
}
declare function SearchableSelect<T extends SearchableSelectOption = SearchableSelectOption>({ value, onValueChange, options, placeholder, searchPlaceholder, className, loading, hasMore, searchable, disabled, filterOption, onSearch, onLoadMore, renderOption, clearable, emptyText, loadingText, noMoreText, debounceMs, onOpen, width, }: SearchableSelectProps<T>): react_jsx_runtime.JSX.Element;

/** Selected range as epoch milliseconds. */
interface DateRange {
    start: number;
    end: number;
}
/** A quick-select preset: sets [now - ms, now]. */
interface DateRangePreset {
    label: string;
    ms: number;
}
interface DateRangePickerProps {
    /** Current range (epoch ms). */
    value: DateRange;
    /** Commit callback (fires on 确定 / preset+确定, not on every calendar click). */
    onChange: (range: DateRange) => void;
    /** Clamp the span to this many days (mirrors CAMP ValidateTimelineDuration).
     *  `0` / omitted = no limit. Also filters out presets longer than the limit. */
    maxDays?: number;
    /** Left-side label. Omit for no label. */
    label?: string;
    /** Quick-select presets. Pass `[]` to hide the sidebar. Defaults to a
     *  1h→3mo ladder. */
    presets?: DateRangePreset[];
    /** Show the HH:mm:ss time inputs. When false the picker is date-only and
     *  commits start-of-day / end-of-day. Default true. */
    showTime?: boolean;
    /** Number of month panels. Default 2. */
    numberOfMonths?: number;
    /** Allow selecting days after today. Default false (future disabled). */
    allowFuture?: boolean;
    /** date-fns format for the trigger text. Defaults to `MM-dd HH:mm:ss`
     *  (or `yyyy-MM-dd` when `showTime` is false). */
    displayFormat?: string;
    /** Extra classes on the outer wrapper. */
    className?: string;
}
declare function DateRangePicker({ value, onChange, maxDays, label, presets, showTime, numberOfMonths, allowFuture, displayFormat, className, }: DateRangePickerProps): react_jsx_runtime.JSX.Element;

interface InputProps extends React$1.InputHTMLAttributes<HTMLInputElement> {
}
declare const Input: React$1.ForwardRefExoticComponent<InputProps & React$1.RefAttributes<HTMLInputElement>>;

interface TextareaProps extends React$1.TextareaHTMLAttributes<HTMLTextAreaElement> {
}
declare const Textarea: React$1.ForwardRefExoticComponent<TextareaProps & React$1.RefAttributes<HTMLTextAreaElement>>;

declare const Select: React$1.FC<SelectPrimitive.SelectProps>;
declare const SelectGroup: React$1.ForwardRefExoticComponent<SelectPrimitive.SelectGroupProps & React$1.RefAttributes<HTMLDivElement>>;
declare const SelectValue: React$1.ForwardRefExoticComponent<SelectPrimitive.SelectValueProps & React$1.RefAttributes<HTMLSpanElement>>;
declare const SelectTrigger: React$1.ForwardRefExoticComponent<Omit<SelectPrimitive.SelectTriggerProps & React$1.RefAttributes<HTMLButtonElement>, "ref"> & React$1.RefAttributes<HTMLButtonElement>>;
declare const SelectScrollUpButton: React$1.ForwardRefExoticComponent<Omit<SelectPrimitive.SelectScrollUpButtonProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const SelectScrollDownButton: React$1.ForwardRefExoticComponent<Omit<SelectPrimitive.SelectScrollDownButtonProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const SelectContent: React$1.ForwardRefExoticComponent<Omit<SelectPrimitive.SelectContentProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const SelectLabel: React$1.ForwardRefExoticComponent<Omit<SelectPrimitive.SelectLabelProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const SelectItem: React$1.ForwardRefExoticComponent<Omit<SelectPrimitive.SelectItemProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const SelectSeparator: React$1.ForwardRefExoticComponent<Omit<SelectPrimitive.SelectSeparatorProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;

interface CheckboxProps extends Omit<React$1.InputHTMLAttributes<HTMLInputElement>, 'checked' | 'onCheckedChange'> {
    checked?: boolean | 'indeterminate';
    onCheckedChange?: (checked: boolean) => void;
}
declare const Checkbox: React$1.ForwardRefExoticComponent<CheckboxProps & React$1.RefAttributes<HTMLInputElement>>;

interface RadioGroupProps extends Omit<React$1.HTMLAttributes<HTMLDivElement>, 'onValueChange'> {
    value?: string;
    onValueChange?: (value: string) => void;
    defaultValue?: string;
}
interface RadioGroupItemProps extends React$1.InputHTMLAttributes<HTMLInputElement> {
    value: string;
}
declare const RadioGroup: React$1.ForwardRefExoticComponent<RadioGroupProps & React$1.RefAttributes<HTMLDivElement>>;
declare const RadioGroupItem: React$1.ForwardRefExoticComponent<RadioGroupItemProps & React$1.RefAttributes<HTMLInputElement>>;

interface SwitchProps {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
}
declare function Switch({ checked, onCheckedChange, disabled, className }: SwitchProps): react_jsx_runtime.JSX.Element;

declare const toggleVariants: (props?: ({
    variant?: "default" | "outline" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & class_variance_authority_types.ClassProp) | undefined) => string;
declare const Toggle: React$1.ForwardRefExoticComponent<Omit<TogglePrimitive.ToggleProps & React$1.RefAttributes<HTMLButtonElement>, "ref"> & VariantProps<(props?: ({
    variant?: "default" | "outline" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & class_variance_authority_types.ClassProp) | undefined) => string> & React$1.RefAttributes<HTMLButtonElement>>;

declare const ToggleGroup: React$1.ForwardRefExoticComponent<((Omit<ToggleGroupPrimitive.ToggleGroupSingleProps & React$1.RefAttributes<HTMLDivElement>, "ref"> | Omit<ToggleGroupPrimitive.ToggleGroupMultipleProps & React$1.RefAttributes<HTMLDivElement>, "ref">) & VariantProps<(props?: ({
    variant?: "default" | "outline" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & class_variance_authority_types.ClassProp) | undefined) => string>) & React$1.RefAttributes<HTMLDivElement>>;
declare const ToggleGroupItem: React$1.ForwardRefExoticComponent<Omit<ToggleGroupPrimitive.ToggleGroupItemProps & React$1.RefAttributes<HTMLButtonElement>, "ref"> & VariantProps<(props?: ({
    variant?: "default" | "outline" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & class_variance_authority_types.ClassProp) | undefined) => string> & React$1.RefAttributes<HTMLButtonElement>>;

declare const Form: React$1.ForwardRefExoticComponent<React$1.FormHTMLAttributes<HTMLFormElement> & React$1.RefAttributes<HTMLFormElement>>;
interface FormFieldProps extends React$1.HTMLAttributes<HTMLDivElement> {
    id?: string;
    error?: string;
}
declare const FormField: React$1.ForwardRefExoticComponent<FormFieldProps & React$1.RefAttributes<HTMLDivElement>>;
declare const FormLabel: React$1.ForwardRefExoticComponent<Omit<Omit<LabelPrimitive.LabelProps & React$1.RefAttributes<HTMLLabelElement>, "ref"> & class_variance_authority.VariantProps<(props?: class_variance_authority_types.ClassProp | undefined) => string> & React$1.RefAttributes<HTMLLabelElement>, "ref"> & React$1.RefAttributes<HTMLLabelElement>>;
declare const FormControl: React$1.ForwardRefExoticComponent<React$1.HTMLAttributes<HTMLDivElement> & React$1.RefAttributes<HTMLDivElement>>;
declare const FormDescription: React$1.ForwardRefExoticComponent<React$1.HTMLAttributes<HTMLParagraphElement> & React$1.RefAttributes<HTMLParagraphElement>>;
declare const FormMessage: React$1.ForwardRefExoticComponent<React$1.HTMLAttributes<HTMLParagraphElement> & React$1.RefAttributes<HTMLParagraphElement>>;

interface KeyValue {
    key: string;
    value: string;
}
interface LabelEditorProps {
    /** 当前键值对列表 */
    value: KeyValue[];
    /** 值变化时的回调 */
    onChange: (value: KeyValue[]) => void;
    /** 初始值（用于检测是否有变化） */
    initialValue?: KeyValue[];
    /** 是否禁用 */
    disabled?: boolean;
    /** 占位符文本 */
    placeholderKey?: string;
    placeholderValue?: string;
    /** 空状态提示 */
    emptyText?: string;
    /** 添加按钮文本 */
    addButtonText?: string;
    /** 是否显示变化检测 */
    showChangeDetection?: boolean;
    /** 最大高度（用于滚动） */
    maxHeight?: string;
}
/**
 * LabelEditor - 键值对编辑器
 *
 * 通用的键值对编辑组件，适用于 Labels、Annotations 等场景。
 *
 * @example
 * ```tsx
 * const [labels, setLabels] = useState<KeyValue[]>([
 *   { key: 'app', value: 'my-app' }
 * ])
 *
 * <LabelEditor
 *   value={labels}
 *   onChange={setLabels}
 *   initialValue={labels}
 * />
 * ```
 */
declare function LabelEditor({ value, onChange, initialValue, disabled, placeholderKey, placeholderValue, emptyText, addButtonText, showChangeDetection, maxHeight, }: LabelEditorProps): react_jsx_runtime.JSX.Element;

interface SearchFilter {
    key: string;
    value: string;
}
interface ColumnDef<T = any> {
    key: string;
    title: string;
    width?: number | string;
    /**
     * Pin this column to the left or right edge — it stays visible while the table
     * scrolls horizontally. Pinned columns should set a numeric `width` so neighbouring
     * pinned columns can be offset correctly (falls back to 150px otherwise).
     */
    fixed?: 'left' | 'right';
    hide?: boolean;
    className?: string;
    render?: (row: T, index: number) => React$1.ReactNode;
    exportFormatter?: (row: T) => string;
    /** Enable this column in the built-in search bar. Default: false. */
    searchable?: boolean;
    /** 'text' = free text input; 'select' = dropdown options. Default: 'text'. */
    searchType?: 'text' | 'select';
    /** Options for searchType='select'. */
    searchOptions?: {
        label: string;
        value: string;
    }[];
}
interface RowAction<T = any> {
    label: string;
    danger?: boolean;
    disabled?: boolean | ((row: T) => boolean);
    hidden?: boolean | ((row: T) => boolean);
    tooltip?: string | ((row: T) => string);
    onClick: (row: T, index: number) => void;
}
interface DeleteConfig<T = any> {
    rowKey?: string;
    rowNameKey?: string;
    confirmTitle?: string;
    confirmText?: string | ((row: T) => string);
    onDelete: (row: T) => Promise<void>;
    disabled?: (row: T) => boolean;
    hidden?: (row: T) => boolean;
    buttonText?: string;
}
interface ExportConfig<T = any> {
    filename?: string;
    customExport?: (data: T[], visibleColumns: ColumnDef<T>[]) => string[][];
}
interface BatchAction<T = any> {
    /** Static text, or a function of the current selection — use the function form to
     *  surface a live count, e.g. `(sel) => \`批量启用 (${sel.filter(...).length})\``. */
    label: string | ((selected: T[]) => string);
    disabled?: (selected: T[]) => boolean;
    onClick: (selected: T[]) => void;
}
interface DataTableProps<T = any> {
    /** Section title rendered inside the card, above the toolbar (on white).
     *  Omit for an untitled table (default). */
    title?: string;
    /** Optional node right-aligned in the title bar (e.g. a control or link).
     *  Only rendered when `title` is set. */
    titleExtra?: React$1.ReactNode;
    data: T[];
    loading?: boolean;
    mode?: 'static' | 'remote';
    rowKey?: string;
    columns: ColumnDef<T>[];
    currentPage?: number;
    pageSize?: number;
    totalItems?: number;
    pageSizes?: number[];
    onPageChange?: (page: number) => void;
    onPageSizeChange?: (size: number) => void;
    rowActions?: RowAction<T>[] | ((row: T) => RowAction<T>[]);
    collapsedActions?: boolean;
    maxVisibleActions?: number;
    deleteConfig?: DeleteConfig<T>;
    actionsTitle?: string;
    stickyActions?: boolean;
    /** Width (px) of the actions column. Needed because table-layout:fixed can't size it to
     *  content; increase it for rows with several visible actions. Default 120. */
    actionsWidth?: number;
    batchActions?: BatchAction<T>[];
    toolbarLeft?: React$1.ReactNode;
    toolbarRight?: React$1.ReactNode;
    toolbarExtra?: React$1.ReactNode;
    showRefresh?: boolean;
    showColumnToggle?: boolean;
    showSelection?: boolean;
    /** Return false to make a row unselectable — its checkbox is disabled and
     *  it is excluded from select-all. Default: every row selectable. */
    isRowSelectable?: (row: T) => boolean;
    exportConfig?: ExportConfig<T>;
    onRefresh?: () => void;
    onSelectionChange?: (rows: T[]) => void;
    /** Called when search filters change (remote mode). */
    onSearch?: (filters: SearchFilter[]) => void;
    emptyText?: string;
    minWidth?: number;
    className?: string;
}
declare function DataTable<T = any>({ data, loading, mode, rowKey, columns, currentPage: externalPage, pageSize: externalPageSize, totalItems: externalTotal, pageSizes, onPageChange, onPageSizeChange, rowActions, collapsedActions, maxVisibleActions, deleteConfig, actionsTitle, stickyActions, actionsWidth, batchActions, toolbarLeft, toolbarRight, toolbarExtra, showRefresh, showColumnToggle, showSelection, isRowSelectable, exportConfig, onRefresh, onSelectionChange, onSearch, emptyText, minWidth, className, title, titleExtra, }: DataTableProps<T>): react_jsx_runtime.JSX.Element;

interface PropertyItem {
    /** Property label (key) */
    label: string;
    /** Property value — string or custom ReactNode */
    value: React$1.ReactNode;
    /** Span multiple columns (defaults to 1) */
    span?: number;
}
interface PropertyListProps {
    /** Array of property items to display */
    items: PropertyItem[];
    /** Number of columns in the grid (1–4) */
    columns?: 1 | 2 | 3 | 4;
    /** Additional CSS classes for the grid container */
    className?: string;
    /** CSS classes for individual label elements */
    labelClassName?: string;
    /** CSS classes for individual value elements */
    valueClassName?: string;
}
declare function PropertyList({ items, columns, className, labelClassName, valueClassName, }: PropertyListProps): react_jsx_runtime.JSX.Element;

declare const Card: React$1.ForwardRefExoticComponent<React$1.HTMLAttributes<HTMLDivElement> & React$1.RefAttributes<HTMLDivElement>>;
declare const CardHeader: React$1.ForwardRefExoticComponent<React$1.HTMLAttributes<HTMLDivElement> & React$1.RefAttributes<HTMLDivElement>>;
declare const CardTitle: React$1.ForwardRefExoticComponent<React$1.HTMLAttributes<HTMLHeadingElement> & React$1.RefAttributes<HTMLHeadingElement>>;
declare const CardDescription: React$1.ForwardRefExoticComponent<React$1.HTMLAttributes<HTMLParagraphElement> & React$1.RefAttributes<HTMLParagraphElement>>;
declare const CardContent: React$1.ForwardRefExoticComponent<React$1.HTMLAttributes<HTMLDivElement> & React$1.RefAttributes<HTMLDivElement>>;
declare const CardFooter: React$1.ForwardRefExoticComponent<React$1.HTMLAttributes<HTMLDivElement> & React$1.RefAttributes<HTMLDivElement>>;

declare const Table: React$1.ForwardRefExoticComponent<React$1.HTMLAttributes<HTMLTableElement> & React$1.RefAttributes<HTMLTableElement>>;
declare const TableHeader: React$1.ForwardRefExoticComponent<React$1.HTMLAttributes<HTMLTableSectionElement> & React$1.RefAttributes<HTMLTableSectionElement>>;
declare const TableBody: React$1.ForwardRefExoticComponent<React$1.HTMLAttributes<HTMLTableSectionElement> & React$1.RefAttributes<HTMLTableSectionElement>>;
declare const TableFooter: React$1.ForwardRefExoticComponent<React$1.HTMLAttributes<HTMLTableSectionElement> & React$1.RefAttributes<HTMLTableSectionElement>>;
declare const TableRow: React$1.ForwardRefExoticComponent<React$1.HTMLAttributes<HTMLTableRowElement> & React$1.RefAttributes<HTMLTableRowElement>>;
declare const TableHead: React$1.ForwardRefExoticComponent<React$1.ThHTMLAttributes<HTMLTableCellElement> & React$1.RefAttributes<HTMLTableCellElement>>;
declare const TableCell: React$1.ForwardRefExoticComponent<React$1.TdHTMLAttributes<HTMLTableCellElement> & React$1.RefAttributes<HTMLTableCellElement>>;
declare const TableCaption: React$1.ForwardRefExoticComponent<React$1.HTMLAttributes<HTMLTableCaptionElement> & React$1.RefAttributes<HTMLTableCaptionElement>>;

declare const Tabs: React$1.ForwardRefExoticComponent<TabsPrimitive.TabsProps & React$1.RefAttributes<HTMLDivElement>>;
declare const TabsList: React$1.ForwardRefExoticComponent<Omit<TabsPrimitive.TabsListProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const TabsTrigger: React$1.ForwardRefExoticComponent<Omit<TabsPrimitive.TabsTriggerProps & React$1.RefAttributes<HTMLButtonElement>, "ref"> & React$1.RefAttributes<HTMLButtonElement>>;
declare const TabsContent: React$1.ForwardRefExoticComponent<Omit<TabsPrimitive.TabsContentProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;

declare const TooltipProvider: React$1.FC<TooltipPrimitive.TooltipProviderProps>;
declare const Tooltip: React$1.FC<TooltipPrimitive.TooltipProps>;
declare const TooltipTrigger: React$1.ForwardRefExoticComponent<TooltipPrimitive.TooltipTriggerProps & React$1.RefAttributes<HTMLButtonElement>>;
declare const TooltipContent: React$1.ForwardRefExoticComponent<Omit<TooltipPrimitive.TooltipContentProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;

interface EmptyStateProps {
    title?: string;
    icon?: React.ComponentType<{
        className?: string;
    }>;
    loading?: boolean;
}
declare function EmptyState({ title, icon: Icon, loading }: EmptyStateProps): react_jsx_runtime.JSX.Element;

interface NumberFieldProps extends Omit<React$1.ComponentPropsWithoutRef<"input">, "value" | "onChange" | "type"> {
    value: number;
    onValueChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    /** 输入框外层容器的类名（组件本身是 `relative` 定位容器 + 绝对定位的加减按钮） */
    className?: string;
}
/**
 * 数字步进器 —— 居中数值 + 左右两侧的减/加按钮。
 *
 * 用于「值有明确上下界、以固定步长调整」的偏好项（字号、侧栏宽度一类）。
 * 相比滑块的好处是能看到精确值；相比分段器的好处是不必把连续区间硬切成几档。
 *
 * **为什么是自实现而不是包一层 primitive**：Radix 没有 NumberField（Vue 侧的 reka-ui 才有），
 * 而这个控件的全部复杂度就是"钳制到 [min,max] + 键盘上下键 + 到界禁用按钮"，包一层反而更绕。
 *
 * 输入采取「编辑时不拦、提交时钳制」：直接钳制会让用户从 16 删到空、想输 9 都做不到
 * （删成空的瞬间被拉回 min）。所以输入过程保留原始字符串，blur / Enter 时才归一。
 */
declare const NumberField: React$1.ForwardRefExoticComponent<NumberFieldProps & React$1.RefAttributes<HTMLInputElement>>;

declare const Progress: React$1.ForwardRefExoticComponent<Omit<ProgressPrimitive.ProgressProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;

declare const Alert: React$1.ForwardRefExoticComponent<React$1.HTMLAttributes<HTMLDivElement> & VariantProps<(props?: ({
    variant?: "default" | "destructive" | null | undefined;
} & class_variance_authority_types.ClassProp) | undefined) => string> & React$1.RefAttributes<HTMLDivElement>>;
declare const AlertTitle: React$1.ForwardRefExoticComponent<React$1.HTMLAttributes<HTMLHeadingElement> & React$1.RefAttributes<HTMLParagraphElement>>;
declare const AlertDescription: React$1.ForwardRefExoticComponent<React$1.HTMLAttributes<HTMLParagraphElement> & React$1.RefAttributes<HTMLParagraphElement>>;

declare const AlertDialog: React$1.FC<AlertDialogPrimitive.AlertDialogProps>;
declare const AlertDialogTrigger: React$1.ForwardRefExoticComponent<AlertDialogPrimitive.AlertDialogTriggerProps & React$1.RefAttributes<HTMLButtonElement>>;
declare const AlertDialogPortal: React$1.FC<AlertDialogPrimitive.AlertDialogPortalProps>;
declare const AlertDialogOverlay: React$1.ForwardRefExoticComponent<Omit<AlertDialogPrimitive.AlertDialogOverlayProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const AlertDialogContent: React$1.ForwardRefExoticComponent<Omit<AlertDialogPrimitive.AlertDialogContentProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const AlertDialogHeader: {
    ({ className, ...props }: React$1.HTMLAttributes<HTMLDivElement>): react_jsx_runtime.JSX.Element;
    displayName: string;
};
declare const AlertDialogFooter: {
    ({ className, ...props }: React$1.HTMLAttributes<HTMLDivElement>): react_jsx_runtime.JSX.Element;
    displayName: string;
};
declare const AlertDialogTitle: React$1.ForwardRefExoticComponent<Omit<AlertDialogPrimitive.AlertDialogTitleProps & React$1.RefAttributes<HTMLHeadingElement>, "ref"> & React$1.RefAttributes<HTMLHeadingElement>>;
declare const AlertDialogDescription: React$1.ForwardRefExoticComponent<Omit<AlertDialogPrimitive.AlertDialogDescriptionProps & React$1.RefAttributes<HTMLParagraphElement>, "ref"> & React$1.RefAttributes<HTMLParagraphElement>>;
declare const AlertDialogAction: React$1.ForwardRefExoticComponent<Omit<AlertDialogPrimitive.AlertDialogActionProps & React$1.RefAttributes<HTMLButtonElement>, "ref"> & React$1.RefAttributes<HTMLButtonElement>>;
declare const AlertDialogCancel: React$1.ForwardRefExoticComponent<Omit<AlertDialogPrimitive.AlertDialogCancelProps & React$1.RefAttributes<HTMLButtonElement>, "ref"> & React$1.RefAttributes<HTMLButtonElement>>;

declare const Dialog: React$1.FC<DialogPrimitive.DialogProps>;
declare const DialogTrigger: React$1.ForwardRefExoticComponent<DialogPrimitive.DialogTriggerProps & React$1.RefAttributes<HTMLButtonElement>>;
declare const DialogPortal: React$1.FC<DialogPrimitive.DialogPortalProps>;
declare const DialogClose: React$1.ForwardRefExoticComponent<DialogPrimitive.DialogCloseProps & React$1.RefAttributes<HTMLButtonElement>>;
declare const DialogOverlay: React$1.ForwardRefExoticComponent<Omit<DialogPrimitive.DialogOverlayProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const DialogContent: React$1.ForwardRefExoticComponent<Omit<DialogPrimitive.DialogContentProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const DialogHeader: {
    ({ className, ...props }: React$1.HTMLAttributes<HTMLDivElement>): react_jsx_runtime.JSX.Element;
    displayName: string;
};
declare const DialogFooter: {
    ({ className, ...props }: React$1.HTMLAttributes<HTMLDivElement>): react_jsx_runtime.JSX.Element;
    displayName: string;
};
declare const DialogTitle: React$1.ForwardRefExoticComponent<Omit<DialogPrimitive.DialogTitleProps & React$1.RefAttributes<HTMLHeadingElement>, "ref"> & React$1.RefAttributes<HTMLHeadingElement>>;
declare const DialogDescription: React$1.ForwardRefExoticComponent<Omit<DialogPrimitive.DialogDescriptionProps & React$1.RefAttributes<HTMLParagraphElement>, "ref"> & React$1.RefAttributes<HTMLParagraphElement>>;

declare const Sheet: React$1.FC<DialogPrimitive.DialogProps>;
declare const SheetTrigger: React$1.ForwardRefExoticComponent<DialogPrimitive.DialogTriggerProps & React$1.RefAttributes<HTMLButtonElement>>;
declare const SheetClose: React$1.ForwardRefExoticComponent<DialogPrimitive.DialogCloseProps & React$1.RefAttributes<HTMLButtonElement>>;
declare const SheetPortal: React$1.FC<DialogPrimitive.DialogPortalProps>;
declare const SheetOverlay: React$1.ForwardRefExoticComponent<Omit<DialogPrimitive.DialogOverlayProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const sheetVariants: (props?: ({
    side?: "top" | "right" | "bottom" | "left" | null | undefined;
} & class_variance_authority_types.ClassProp) | undefined) => string;
interface SheetContentProps extends React$1.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, VariantProps<typeof sheetVariants> {
    showCloseButton?: boolean;
}
declare const SheetContent: React$1.ForwardRefExoticComponent<SheetContentProps & React$1.RefAttributes<HTMLDivElement>>;
declare const SheetHeader: {
    ({ className, ...props }: React$1.HTMLAttributes<HTMLDivElement>): react_jsx_runtime.JSX.Element;
    displayName: string;
};
declare const SheetFooter: {
    ({ className, ...props }: React$1.HTMLAttributes<HTMLDivElement>): react_jsx_runtime.JSX.Element;
    displayName: string;
};
declare const SheetTitle: React$1.ForwardRefExoticComponent<Omit<DialogPrimitive.DialogTitleProps & React$1.RefAttributes<HTMLHeadingElement>, "ref"> & React$1.RefAttributes<HTMLHeadingElement>>;
declare const SheetDescription: React$1.ForwardRefExoticComponent<Omit<DialogPrimitive.DialogDescriptionProps & React$1.RefAttributes<HTMLParagraphElement>, "ref"> & React$1.RefAttributes<HTMLParagraphElement>>;

interface SpinnerProps {
    size?: "sm" | "md" | "lg";
    className?: string;
}
declare function Spinner({ size, className }: SpinnerProps): react_jsx_runtime.JSX.Element;
interface LoadingProps {
    text?: string;
    className?: string;
}
declare function Loading({ text, className }: LoadingProps): react_jsx_runtime.JSX.Element;

interface LoadingOverlayProps {
    loading: boolean;
    text?: string;
    className?: string;
}
declare function LoadingOverlay({ loading, text, className }: LoadingOverlayProps): react_jsx_runtime.JSX.Element | null;

interface SkeletonProps extends React$1.HTMLAttributes<HTMLDivElement> {
}
declare function Skeleton({ className, ...props }: SkeletonProps): react_jsx_runtime.JSX.Element;

type StatusVariant = "success" | "warning" | "error" | "info" | "neutral" | "default";
interface StatusIndicatorProps {
    /** Status variant controlling the color */
    variant?: StatusVariant;
    /** Whether to show the animated ping effect */
    animated?: boolean;
    /** Size of the indicator dot */
    size?: "sm" | "md" | "lg";
    /** Optional label text displayed next to the dot */
    label?: string;
    /** Additional CSS classes */
    className?: string;
}
declare function StatusIndicator({ variant, animated, size, label, className, }: StatusIndicatorProps): react_jsx_runtime.JSX.Element;

interface ConfirmDialogProps {
    /** Whether the dialog is open */
    open: boolean;
    /** Callback when open state changes */
    onOpenChange: (open: boolean) => void;
    /** Dialog title */
    title: string;
    /** Dialog description */
    description?: string;
    /** Text the user must type to confirm (for destructive actions) */
    confirmText?: string;
    /** Placeholder for the confirmation input */
    confirmPlaceholder?: string;
    /** Label for the confirm button */
    confirmLabel?: string;
    /** Label for the cancel button */
    cancelLabel?: string;
    /** Whether the action is destructive (changes confirm button style) */
    destructive?: boolean;
    /** Whether a confirmation is in progress */
    loading?: boolean;
    /** Callback when user confirms */
    onConfirm: () => void;
    /** Callback when user cancels */
    onCancel?: () => void;
}
declare function ConfirmDialog({ open, onOpenChange, title, description, confirmText, confirmPlaceholder, confirmLabel, cancelLabel, destructive, loading, onConfirm, onCancel, }: ConfirmDialogProps): react_jsx_runtime.JSX.Element;

interface ConfirmDeleteDialogProps {
    /** Whether the dialog is open */
    open: boolean;
    /** Callback when open state changes */
    onOpenChange: (open: boolean) => void;
    /** Dialog title */
    title: string;
    /** Description of the delete action */
    description: string;
    /** List of item names to be deleted */
    itemNames: string[];
    /** Async callback when user confirms deletion */
    onConfirm: () => Promise<void>;
    /** Whether a deletion is in progress */
    loading?: boolean;
}
/**
 * ConfirmDeleteDialog — Danger confirmation dialog for deleting one or more items.
 *
 * Displays the list of items to be deleted with red warning styling.
 * Calls the async `onConfirm` handler and closes on success.
 *
 * For single high-value resources requiring name verification, use `ConfirmDialog`
 * with `confirmText` and `destructive` props instead.
 */
declare function ConfirmDeleteDialog({ open, onOpenChange, title, description, itemNames, onConfirm, loading, }: ConfirmDeleteDialogProps): react_jsx_runtime.JSX.Element;

interface NameConfirmDeleteDialogProps {
    /** Whether the dialog is open */
    open: boolean;
    /** Callback when open state changes */
    onOpenChange: (open: boolean) => void;
    /** The identifier the user must type to confirm */
    resourceIdentifier?: string;
    /** Resource type label displayed in the title and input hint */
    resourceType: string;
    /** Async callback invoked when name matches and user confirms */
    onConfirm: () => Promise<void>;
    /** Disables inputs and shows loading state */
    isLoading?: boolean;
    /** Error message shown in a red banner */
    error?: string | null;
    /** Prefix for the dialog title (e.g. "删除集群") */
    titlePrefix?: string;
    /** Additional description text shown above the input */
    extraDescription?: string;
    /** Whether to show a cascade-delete checkbox */
    showCascadeOption?: boolean;
    /** Callback when cascade toggle changes */
    onCascadeChange?: (cascade: boolean) => void;
    /** Initial value of the cascade checkbox */
    defaultCascade?: boolean;
}
/**
 * NameConfirmDeleteDialog — High-protection deletion dialog that requires the
 * user to type the exact resource identifier before the confirm button becomes enabled.
 *
 * Used for irreversible, high-impact deletions (clusters, workspaces, etc.).
 * The red circular warning icon (distinct from ConfirmDeleteDialog's AlertTriangle)
 * signals maximum-danger operations.
 *
 * For simpler batch deletions, use `ConfirmDeleteDialog` instead.
 */
declare function NameConfirmDeleteDialog({ open, onOpenChange, resourceIdentifier, resourceType, onConfirm, isLoading, error, titlePrefix, extraDescription, showCascadeOption, onCascadeChange, defaultCascade, }: NameConfirmDeleteDialogProps): react_jsx_runtime.JSX.Element;

interface CreateResourceDialogProps {
    /** Whether the dialog is open */
    open: boolean;
    /** Callback when open state changes */
    onOpenChange: (open: boolean) => void;
    /** Dialog title */
    title: string;
    /** Dialog description */
    description: string;
    /** Called with the current YAML content on submit */
    onConfirm: (yaml: string) => void;
    /** Disables inputs and shows "创建中..." while true */
    isCreating?: boolean;
    /** Initial YAML content pre-filled in the textarea */
    defaultYaml?: string;
}
/**
 * CreateResourceDialog — Generic YAML-based resource creation dialog.
 *
 * Provides a full-width monospace textarea for entering YAML configuration.
 * The confirm button is disabled when the textarea is empty or `isCreating` is true.
 * The dialog resets to `defaultYaml` each time it opens.
 *
 * For Monaco Editor with YAML validation, use `YamlEditDialog` instead.
 */
declare function CreateResourceDialog({ open, onOpenChange, title, description, onConfirm, isCreating, defaultYaml, }: CreateResourceDialogProps): react_jsx_runtime.JSX.Element;

interface YamlEditDialogProps {
    /** Whether the dialog is open */
    open: boolean;
    /** Callback when open state changes */
    onOpenChange: (open: boolean) => void;
    /** Shown in the title bar with a FileText icon */
    title: string;
    /** Shown inline next to the title (small text) */
    description?: string;
    /** Async save callback; required unless readOnly */
    onConfirm?: (yaml: string) => Promise<void>;
    /** External loading state (disables editor and buttons) */
    isUpdating?: boolean;
    /** YAML content loaded into the editor on open */
    initialYaml?: string;
    /** Whether to run YAML/JSON parse validation on change */
    showValidation?: boolean;
    /** Renders a "关闭" button only; editor is not editable */
    readOnly?: boolean;
}
/**
 * YamlEditDialog — Full-screen YAML editor dialog backed by Monaco Editor.
 *
 * Supports YAML/JSON syntax validation, read-only view mode, and async save.
 * Uses a near-fullscreen layout with a dark Monaco editor on #EFF4F9 background.
 *
 * For a lightweight alternative without Monaco, use `CreateResourceDialog`.
 *
 * **Dependency:** requires `@monaco-editor/react` and Monaco Editor web workers.
 */
declare function YamlEditDialog({ open, onOpenChange, title, description, onConfirm, isUpdating, initialYaml, showValidation, readOnly, }: YamlEditDialogProps): react_jsx_runtime.JSX.Element;

interface ProgressRingProps {
    /** Progress percentage (0-100) */
    value: number;
    /** SVG size in pixels */
    size?: number;
    /** Ring stroke width */
    strokeWidth?: number;
    /** Color of the progress arc */
    color?: string;
    /** Color of the background track */
    trackColor?: string;
    /** Content displayed in the center of the ring */
    children?: React$1.ReactNode;
    /** Additional CSS classes */
    className?: string;
}
declare function ProgressRing({ value, size, strokeWidth, color, trackColor, children, className, }: ProgressRingProps): react_jsx_runtime.JSX.Element;

interface CollapsibleSectionProps {
    /** Section title */
    title: string;
    /** Optional icon next to the title */
    icon?: React$1.ReactNode;
    /** Optional right-side content (e.g., badge, count) */
    extra?: React$1.ReactNode;
    /** Whether initially expanded */
    defaultExpanded?: boolean;
    /** Controlled expanded state */
    expanded?: boolean;
    /** Callback when expanded state changes */
    onToggle?: (expanded: boolean) => void;
    /** Content inside the collapsible section */
    children: React$1.ReactNode;
    /** Additional CSS classes for the wrapper */
    className?: string;
    /** Additional CSS classes for the content area */
    contentClassName?: string;
}
declare function CollapsibleSection({ title, icon, extra, defaultExpanded, expanded: controlledExpanded, onToggle, children, className, contentClassName, }: CollapsibleSectionProps): react_jsx_runtime.JSX.Element;

declare const DropdownMenu: React$1.FC<DropdownMenuPrimitive.DropdownMenuProps>;
declare const DropdownMenuTrigger: React$1.ForwardRefExoticComponent<DropdownMenuPrimitive.DropdownMenuTriggerProps & React$1.RefAttributes<HTMLButtonElement>>;
declare const DropdownMenuGroup: React$1.ForwardRefExoticComponent<DropdownMenuPrimitive.DropdownMenuGroupProps & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuPortal: React$1.FC<DropdownMenuPrimitive.DropdownMenuPortalProps>;
declare const DropdownMenuSub: React$1.FC<DropdownMenuPrimitive.DropdownMenuSubProps>;
declare const DropdownMenuRadioGroup: React$1.ForwardRefExoticComponent<DropdownMenuPrimitive.DropdownMenuRadioGroupProps & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuSubTrigger: React$1.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuSubTriggerProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & {
    inset?: boolean;
} & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuSubContent: React$1.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuSubContentProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuContent: React$1.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuContentProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuItem: React$1.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuItemProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & {
    inset?: boolean;
} & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuCheckboxItem: React$1.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuCheckboxItemProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuRadioItem: React$1.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuRadioItemProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuLabel: React$1.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuLabelProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & {
    inset?: boolean;
} & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuSeparator: React$1.ForwardRefExoticComponent<Omit<DropdownMenuPrimitive.DropdownMenuSeparatorProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const DropdownMenuShortcut: {
    ({ className, ...props }: React$1.HTMLAttributes<HTMLSpanElement>): react_jsx_runtime.JSX.Element;
    displayName: string;
};

interface PaginationProps {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (size: number) => void;
    className?: string;
    /** Page size options */
    pageSizeOptions?: number[];
}
declare function Pagination({ currentPage, pageSize, totalItems, onPageChange, onPageSizeChange, className, pageSizeOptions, }: PaginationProps): react_jsx_runtime.JSX.Element;

declare const Popover: React$1.FC<PopoverPrimitive.PopoverProps>;
declare const PopoverTrigger: React$1.ForwardRefExoticComponent<PopoverPrimitive.PopoverTriggerProps & React$1.RefAttributes<HTMLButtonElement>>;
declare const PopoverAnchor: React$1.ForwardRefExoticComponent<PopoverPrimitive.PopoverAnchorProps & React$1.RefAttributes<HTMLDivElement>>;
declare const PopoverContent: React$1.ForwardRefExoticComponent<Omit<PopoverPrimitive.PopoverContentProps & React$1.RefAttributes<HTMLDivElement>, "ref"> & React$1.RefAttributes<HTMLDivElement>>;

type ChartConfig = Record<string, {
    label?: React$1.ReactNode;
    icon?: React$1.ComponentType;
} & ({
    color?: string;
    theme?: never;
} | {
    color?: never;
    theme: Record<string, string>;
})>;
interface ChartContainerProps extends React$1.ComponentProps<"div"> {
    config: ChartConfig;
    children: React$1.ComponentProps<typeof Slot>["children"];
}
interface ChartTooltipProps {
    active?: boolean;
    payload?: any[];
    label?: string;
    indicator?: "line" | "dot" | "dashed";
    hideLabel?: boolean;
    hideIndicator?: boolean;
    labelFormatter?: (value: any, payload: any[]) => React$1.ReactNode;
    labelClassName?: string;
    formatter?: (value: any, name: any, props: any) => React$1.ReactNode;
    color?: string;
    nameKey?: string;
    labelKey?: string;
}
declare const ChartContainer: React$1.ForwardRefExoticComponent<Omit<ChartContainerProps, "ref"> & React$1.RefAttributes<HTMLDivElement>>;
declare const ChartTooltip: ({ children }: {
    children: React$1.ReactNode;
}) => react_jsx_runtime.JSX.Element;
declare const ChartTooltipContent: React$1.ForwardRefExoticComponent<React$1.HTMLAttributes<HTMLDivElement> & ChartTooltipProps & React$1.RefAttributes<HTMLDivElement>>;

interface KPICardProps {
    /** 图标 */
    icon: LucideIcon;
    /** 指标标题 */
    title: string;
    /** 主要数值 */
    value: number | string;
    /** 单位（可选） */
    unit?: string;
    /** 变化趋势（可选） */
    trend?: {
        value: number;
        isPositive: boolean;
    };
    /** 图标背景色类名 */
    iconBgColor?: string;
    /** 图标颜色类名 */
    iconColor?: string;
    className?: string;
}
/**
 * KPI 统计卡片组件
 *
 * 用于展示关键性能指标，支持趋势指示器。
 *
 * @example
 * ```tsx
 * import { KPICard } from '@riseaicloud/ui'
 * import { Activity } from 'lucide-react'
 *
 * <KPICard
 *   icon={Activity}
 *   title="活跃节点"
 *   value={42}
 *   trend={{ value: 5, isPositive: true }}
 * />
 * ```
 */
declare function KPICard({ icon: Icon, title, value, unit, trend, iconBgColor, iconColor, className, }: KPICardProps): react_jsx_runtime.JSX.Element;

interface ResourceChartDataPoint {
    /** 时间戳或时间标签 */
    time: string | number;
    /** 数值 */
    value: number;
}
interface ResourceChartProps {
    /** 图表标题 */
    title: string;
    /** 当前使用值（带单位字符串） */
    currentValue: string;
    /** 使用百分比 */
    percentage: number;
    /** 时间序列数据 */
    timeSeries: ResourceChartDataPoint[];
    /** 图表主题色 */
    color?: string;
    /** 数值单位（如 %、GB） */
    unit?: string;
    /** 是否显示网格 */
    showGrid?: boolean;
    className?: string;
}
/**
 * 资源使用率图表组件
 *
 * 用于展示 CPU、内存、磁盘等资源的时间序列使用情况，
 * 包含进度条和面积图。
 *
 * @example
 * ```tsx
 * import { ResourceChart } from '@riseaicloud/ui'
 *
 * <ResourceChart
 *   title="CPU 使用率"
 *   currentValue="2.4 cores"
 *   percentage={62.5}
 *   timeSeries={cpuTimeSeries}
 *   color="#3b82f6"
 *   unit="%"
 * />
 * ```
 */
declare function ResourceChart({ title, currentValue, percentage, timeSeries, color, unit, showGrid, className, }: ResourceChartProps): react_jsx_runtime.JSX.Element;

export { Alert, AlertDescription, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, AlertDialogPortal, AlertDialogTitle, AlertDialogTrigger, AlertTitle, Avatar, AvatarFallback, AvatarImage, Badge, type BadgeProps, type BatchAction, Button, type ButtonProps, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent, Checkbox, type CheckboxProps, Collapsible, CollapsibleContent, CollapsibleSection, type CollapsibleSectionProps, CollapsibleTrigger, type ColumnDef, ConfirmDeleteDialog, type ConfirmDeleteDialogProps, ConfirmDialog, type ConfirmDialogProps, CreateResourceDialog, type CreateResourceDialogProps, DataTable, type DataTableProps, type DateRange, DateRangePicker, type DateRangePickerProps, type DateRangePreset, type DeleteConfig, Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, EmptyState, type EmptyStateProps, type ExportConfig, Form, FormControl, FormDescription, FormField, FormLabel, FormMessage, Input, type InputProps, KPICard, type KPICardProps, type KeyValue, Label, LabelEditor, type LabelEditorProps, Loading, LoadingOverlay, type LoadingOverlayProps, NameConfirmDeleteDialog, type NameConfirmDeleteDialogProps, NumberField, type NumberFieldProps, PageHeader, type PageHeaderProps, Pagination, type PaginationProps, Popover, PopoverAnchor, PopoverContent, PopoverTrigger, Progress, ProgressRing, type ProgressRingProps, type PropertyItem, PropertyList, type PropertyListProps, RadioGroup, RadioGroupItem, type RadioGroupItemProps, type RadioGroupProps, ResourceChart, type ResourceChartDataPoint, type ResourceChartProps, type RowAction, ScrollArea, ScrollBar, type SearchFilter, SearchableSelect, type SearchableSelectOption, type SearchableSelectProps, Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger, SelectValue, Separator, Sheet, SheetClose, SheetContent, type SheetContentProps, SheetDescription, SheetFooter, SheetHeader, SheetOverlay, SheetPortal, SheetTitle, SheetTrigger, Skeleton, type SkeletonProps, Spinner, StatusIndicator, type StatusIndicatorProps, type StatusVariant, Switch, type SwitchProps, Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, type TextareaProps, Toggle, ToggleGroup, ToggleGroupItem, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, YamlEditDialog, type YamlEditDialogProps, badgeVariants, buttonVariants, cn, toggleVariants };
