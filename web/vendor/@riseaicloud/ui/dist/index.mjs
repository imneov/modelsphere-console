"use client";
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as React18 from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as LabelPrimitive from '@radix-ui/react-label';
import { ChevronDown, ChevronUp, Check, Circle, ChevronRight, X, Minus, Plus, Calendar, Package, AlertTriangle, Search, Columns, Download, RotateCw, MoreHorizontal, FileText, AlertCircle } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { startOfMonth, format, startOfDay, endOfDay, subYears, subMonths, addMonths, addYears } from 'date-fns';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as TogglePrimitive from '@radix-ui/react-toggle';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import Editor from '@monaco-editor/react';
import { load } from 'js-yaml';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { ResponsiveContainer, AreaChart, CartesianGrid, XAxis, YAxis, Area } from 'recharts';

// src/utils/index.ts
function cn(...inputs) {
  return twMerge(clsx(inputs));
}
var Separator = React18.forwardRef(
  ({ className, orientation = "horizontal", decorative = true, ...props }, ref) => /* @__PURE__ */ jsx(
    SeparatorPrimitive.Root,
    {
      ref,
      decorative,
      orientation,
      className: cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
        className
      ),
      ...props
    }
  )
);
Separator.displayName = SeparatorPrimitive.Root.displayName;
var ScrollArea = React18.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ jsxs(
  ScrollAreaPrimitive.Root,
  {
    ref,
    className: cn("relative overflow-hidden", className),
    ...props,
    children: [
      /* @__PURE__ */ jsx(ScrollAreaPrimitive.Viewport, { className: "h-full w-full rounded-[inherit]", children }),
      /* @__PURE__ */ jsx(ScrollBar, {}),
      /* @__PURE__ */ jsx(ScrollAreaPrimitive.Corner, {})
    ]
  }
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;
var ScrollBar = React18.forwardRef(({ className, orientation = "vertical", ...props }, ref) => /* @__PURE__ */ jsx(
  ScrollAreaPrimitive.ScrollAreaScrollbar,
  {
    ref,
    orientation,
    className: cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    ),
    ...props,
    children: /* @__PURE__ */ jsx(ScrollAreaPrimitive.ScrollAreaThumb, { className: "relative flex-1 rounded-full bg-border" })
  }
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;
var Collapsible = CollapsiblePrimitive.Root;
var CollapsibleTrigger2 = CollapsiblePrimitive.CollapsibleTrigger;
var CollapsibleContent2 = CollapsiblePrimitive.CollapsibleContent;
function PageHeader({ title, icon, onBack, extra }) {
  return /* @__PURE__ */ jsxs("div", { className: "bg-card border-b border-border px-6 py-4 flex-shrink-0 flex items-center justify-between", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-2", children: [
      onBack && /* @__PURE__ */ jsx(
        "button",
        {
          onClick: onBack,
          className: "text-muted-foreground hover:text-foreground bg-transparent border-0 cursor-pointer mr-1 flex items-center",
          children: /* @__PURE__ */ jsx("svg", { className: "h-4 w-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M15 19l-7-7 7-7" }) })
        }
      ),
      icon && /* @__PURE__ */ jsx("span", { className: "flex-shrink-0", children: icon }),
      /* @__PURE__ */ jsx("h1", { className: "text-lg font-medium text-foreground", children: title })
    ] }),
    extra && /* @__PURE__ */ jsx("div", { className: "flex items-center gap-2", children: extra })
  ] });
}
var buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
var Button = React18.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return /* @__PURE__ */ jsx(
      Comp,
      {
        className: cn(buttonVariants({ variant, size, className })),
        ref,
        ...props
      }
    );
  }
);
Button.displayName = "Button";
var badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
function Badge({ className, variant, ...props }) {
  return /* @__PURE__ */ jsx("div", { className: cn(badgeVariants({ variant }), className), ...props });
}
var Avatar = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  AvatarPrimitive.Root,
  {
    ref,
    className: cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    ),
    ...props
  }
));
Avatar.displayName = AvatarPrimitive.Root.displayName;
var AvatarImage = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  AvatarPrimitive.Image,
  {
    ref,
    className: cn("aspect-square h-full w-full", className),
    ...props
  }
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;
var AvatarFallback = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  AvatarPrimitive.Fallback,
  {
    ref,
    className: cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      className
    ),
    ...props
  }
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;
var labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
);
var Label = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  LabelPrimitive.Root,
  {
    ref,
    className: cn(labelVariants(), className),
    ...props
  }
));
Label.displayName = LabelPrimitive.Root.displayName;
function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  className,
  loading = false,
  hasMore = false,
  searchable = true,
  disabled = false,
  filterOption,
  onSearch,
  onLoadMore,
  renderOption,
  clearable = true,
  emptyText = "No results found",
  loadingText = "Loading...",
  noMoreText = "No more data",
  debounceMs = 300,
  onOpen,
  width
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchMode, setIsSearchMode] = useState(false);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const debounceTimerRef = useRef();
  useEffect(() => {
    if (!isOpen || !onSearch) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      if (isOpen) {
        onSearch(searchQuery.trim());
      }
    }, debounceMs);
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, isOpen, onSearch, debounceMs]);
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery("");
        setIsSearchMode(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const handleScroll = useCallback(
    (e) => {
      if (!onLoadMore || !hasMore || loading) return;
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
      if (scrollHeight - scrollTop <= clientHeight + 5) {
        onLoadMore();
      }
    },
    [hasMore, loading, onLoadMore]
  );
  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    onOpen?.();
  };
  const handleSelect = (selectedValue) => {
    onValueChange(selectedValue);
    setIsOpen(false);
    setSearchQuery("");
    setIsSearchMode(false);
  };
  const handleClear = (e) => {
    e.stopPropagation();
    setSearchQuery("");
    onValueChange("");
    setIsOpen(true);
  };
  const selectedOption = options.find((opt) => opt.value === value);
  const isRemote = !!onSearch;
  const displayedOptions = React18.useMemo(() => {
    if (!searchable || isRemote || !searchQuery.trim()) return options;
    const q = searchQuery.trim();
    const f = filterOption ?? ((input, opt) => opt.label.toLowerCase().includes(input.toLowerCase()));
    return options.filter((opt) => f(q, opt));
  }, [options, searchable, isRemote, searchQuery, filterOption]);
  const getDisplayText = () => {
    if (selectedOption) return selectedOption.label;
    return value || placeholder;
  };
  const showClear = clearable && value && !disabled;
  return /* @__PURE__ */ jsxs(
    "div",
    {
      ref: dropdownRef,
      className: cn("relative", className),
      style: width ? { width } : void 0,
      children: [
        /* @__PURE__ */ jsxs(
          "div",
          {
            onClick: handleOpen,
            className: cn(
              "w-full min-w-[120px] h-8 px-3 text-sm border border-border rounded bg-background",
              "flex items-center justify-between",
              disabled ? "opacity-60 cursor-not-allowed" : "hover:border-muted-foreground/50 focus:outline-none cursor-pointer"
            ),
            children: [
              isOpen && searchable ? /* @__PURE__ */ jsx(
                "input",
                {
                  ref: inputRef,
                  type: "text",
                  placeholder: searchPlaceholder,
                  value: searchQuery,
                  onChange: (e) => {
                    setSearchQuery(e.target.value);
                    setIsSearchMode(true);
                  },
                  size: 1,
                  className: "flex-1 min-w-0 outline-none bg-transparent text-sm",
                  autoFocus: true,
                  onClick: (e) => e.stopPropagation()
                }
              ) : /* @__PURE__ */ jsxs(
                "span",
                {
                  className: cn(
                    "truncate text-left flex-1 flex items-center gap-1.5",
                    !value && "text-muted-foreground"
                  ),
                  title: getDisplayText(),
                  children: [
                    selectedOption?.icon && /* @__PURE__ */ jsx("span", { className: "shrink-0 inline-flex", children: selectedOption.icon }),
                    getDisplayText()
                  ]
                }
              ),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
                showClear && /* @__PURE__ */ jsx(
                  X,
                  {
                    className: "h-3 w-3 text-muted-foreground hover:text-foreground cursor-pointer",
                    onClick: handleClear
                  }
                ),
                /* @__PURE__ */ jsx(
                  ChevronDown,
                  {
                    className: cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      isOpen && "rotate-180"
                    )
                  }
                )
              ] })
            ]
          }
        ),
        isOpen && /* @__PURE__ */ jsx("div", { className: "absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg", children: /* @__PURE__ */ jsx(
          "div",
          {
            ref: listRef,
            className: "max-h-48 overflow-y-auto",
            onScroll: handleScroll,
            children: displayedOptions.length > 0 ? /* @__PURE__ */ jsxs(Fragment, { children: [
              displayedOptions.map((option) => {
                const isSelected = value === option.value;
                return /* @__PURE__ */ jsxs(
                  "button",
                  {
                    type: "button",
                    disabled: option.disabled,
                    onClick: () => !option.disabled && handleSelect(option.value),
                    className: cn(
                      "w-full px-3 py-2 text-sm text-left hover:bg-accent",
                      "flex items-center justify-between gap-2",
                      isSelected && "bg-accent text-accent-foreground",
                      option.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent"
                    ),
                    children: [
                      renderOption ? renderOption(option, isSelected) : /* @__PURE__ */ jsxs("span", { className: "truncate flex items-center gap-1.5", children: [
                        option.icon && /* @__PURE__ */ jsx("span", { className: "shrink-0 inline-flex", children: option.icon }),
                        option.label
                      ] }),
                      isSelected && /* @__PURE__ */ jsx(Check, { className: "h-4 w-4 shrink-0" })
                    ]
                  },
                  option.value
                );
              }),
              loading && /* @__PURE__ */ jsx("div", { className: "px-3 py-2 text-sm text-muted-foreground text-center", children: loadingText }),
              isRemote && !hasMore && displayedOptions.length > 1 && !searchQuery.trim() && /* @__PURE__ */ jsx("div", { className: "px-3 py-2 text-sm text-muted-foreground/60 text-center", children: noMoreText })
            ] }) : /* @__PURE__ */ jsx("div", { className: "px-3 py-2 text-sm text-muted-foreground text-center", children: loading ? loadingText : emptyText })
          }
        ) })
      ]
    }
  );
}
var DEFAULT_PRESETS = [
  { label: "\u524D1\u5C0F\u65F6", ms: 36e5 },
  { label: "\u524D6\u5C0F\u65F6", ms: 6 * 36e5 },
  { label: "\u524D12\u5C0F\u65F6", ms: 12 * 36e5 },
  { label: "\u524D1\u5929", ms: 864e5 },
  { label: "\u524D2\u5929", ms: 2 * 864e5 },
  { label: "\u524D\u4E00\u5468", ms: 7 * 864e5 },
  { label: "\u524D\u4E24\u5468", ms: 14 * 864e5 },
  { label: "\u524D\u4E00\u4E2A\u6708", ms: 30 * 864e5 },
  { label: "\u524D\u4E09\u4E2A\u6708", ms: 90 * 864e5 }
];
var inputCls = "h-8 px-2 text-xs bg-background border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring";
function mergeDateTime(date, time) {
  const [h = 0, m = 0, s = 0] = time.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, s, 0);
  return d;
}
function DateRangePicker({
  value,
  onChange,
  maxDays = 0,
  label,
  presets = DEFAULT_PRESETS,
  showTime = true,
  numberOfMonths = 2,
  allowFuture = false,
  displayFormat,
  className
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(new Date(value.start)));
  const [from, setFrom] = useState(new Date(value.start));
  const [to, setTo] = useState(new Date(value.end));
  const [startTime, setStartTime] = useState(format(new Date(value.start), "HH:mm:ss"));
  const [endTime, setEndTime] = useState(format(new Date(value.end), "HH:mm:ss"));
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const shownPresets = maxDays > 0 ? presets.filter((p) => p.ms <= maxDays * 864e5) : presets;
  const openPanel = () => {
    setFrom(new Date(value.start));
    setTo(new Date(value.end));
    setStartTime(format(new Date(value.start), "HH:mm:ss"));
    setEndTime(format(new Date(value.end), "HH:mm:ss"));
    setMonth(startOfMonth(new Date(value.start)));
    setOpen(true);
  };
  const applyPreset = (ms) => {
    const end = /* @__PURE__ */ new Date();
    const start = new Date(Date.now() - ms);
    setFrom(start);
    setTo(end);
    setStartTime(format(start, "HH:mm:ss"));
    setEndTime(format(end, "HH:mm:ss"));
    setMonth(startOfMonth(start));
  };
  const confirm = () => {
    const s = showTime ? mergeDateTime(from, startTime) : startOfDay(from);
    const e = showTime ? mergeDateTime(to, endTime) : endOfDay(to);
    onChange({ start: s.getTime(), end: e.getTime() });
    setOpen(false);
  };
  const trigFmt = displayFormat ?? (showTime ? "MM-dd HH:mm:ss" : "yyyy-MM-dd");
  const triggerText = `${format(new Date(value.start), trigFmt)}  \u81F3  ${format(new Date(value.end), trigFmt)}`;
  const Caption = ({ calendarMonth }) => {
    const d = calendarMonth.date;
    const NavBtn = ({ onClick, children }) => /* @__PURE__ */ jsx(
      "button",
      {
        onClick,
        className: "h-6 w-6 inline-flex items-center justify-center text-muted-foreground hover:text-foreground rounded",
        children
      }
    );
    return /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between px-1 pb-2", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex gap-0.5", children: [
        /* @__PURE__ */ jsx(NavBtn, { onClick: () => setMonth(subYears(month, 1)), children: "\xAB" }),
        /* @__PURE__ */ jsx(NavBtn, { onClick: () => setMonth(subMonths(month, 1)), children: "\u2039" })
      ] }),
      /* @__PURE__ */ jsxs("span", { className: "text-sm font-medium text-foreground", children: [
        d.getFullYear(),
        " \u5E74 ",
        d.getMonth() + 1,
        " \u6708"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-0.5", children: [
        /* @__PURE__ */ jsx(NavBtn, { onClick: () => setMonth(addMonths(month, 1)), children: "\u203A" }),
        /* @__PURE__ */ jsx(NavBtn, { onClick: () => setMonth(addYears(month, 1)), children: "\xBB" })
      ] })
    ] });
  };
  const DayBtn = (props) => {
    const { day, modifiers, className: _c, children, ...rest } = props;
    const isMiddle = modifiers.range_middle;
    const isEnd = !isMiddle && (modifiers.range_start || modifiers.range_end || modifiers.selected);
    return /* @__PURE__ */ jsx(
      "button",
      {
        ...rest,
        className: cn(
          "h-9 w-9 text-sm inline-flex items-center justify-center transition-colors",
          isEnd ? "bg-foreground text-background rounded-full font-medium" : isMiddle ? "text-foreground" : modifiers.disabled ? "text-muted-foreground/50 cursor-not-allowed" : modifiers.outside ? "text-muted-foreground/50" : "text-foreground hover:bg-accent rounded"
        ),
        children: day.date.getDate()
      }
    );
  };
  return /* @__PURE__ */ jsxs("div", { className: cn("relative flex items-center gap-2", className), ref, children: [
    label && /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground whitespace-nowrap", children: label }),
    /* @__PURE__ */ jsxs(
      "button",
      {
        onClick: () => open ? setOpen(false) : openPanel(),
        className: "h-8 pl-2.5 pr-3 inline-flex items-center gap-2 bg-background border border-border rounded text-xs text-foreground hover:border-muted-foreground",
        children: [
          /* @__PURE__ */ jsx(Calendar, { className: "h-4 w-4 text-muted-foreground" }),
          /* @__PURE__ */ jsx("span", { className: "tabular-nums", children: triggerText })
        ]
      }
    ),
    open && /* @__PURE__ */ jsxs(
      "div",
      {
        className: "absolute top-full left-0 mt-1 z-50 bg-background border border-border rounded shadow-lg flex",
        style: { minWidth: numberOfMonths > 1 ? 720 : 380 },
        children: [
          shownPresets.length > 0 && /* @__PURE__ */ jsx("div", { className: "w-28 border-r border-border/50 py-2 max-h-[360px] overflow-y-auto", children: shownPresets.map((p) => /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => applyPreset(p.ms),
              className: "w-full text-left px-4 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              children: p.label
            },
            p.label
          )) }),
          /* @__PURE__ */ jsxs("div", { className: "flex-1 p-3", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
              /* @__PURE__ */ jsx("input", { readOnly: true, className: `${inputCls} w-24 text-center`, value: format(from, "MM-dd") }),
              showTime && /* @__PURE__ */ jsx(
                "input",
                {
                  className: `${inputCls} w-24 text-center`,
                  value: startTime,
                  onChange: (e) => setStartTime(e.target.value),
                  placeholder: "HH:mm:ss"
                }
              ),
              /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "\u203A" }),
              /* @__PURE__ */ jsx("input", { readOnly: true, className: `${inputCls} w-24 text-center`, value: format(to, "MM-dd") }),
              showTime && /* @__PURE__ */ jsx(
                "input",
                {
                  className: `${inputCls} w-24 text-center`,
                  value: endTime,
                  onChange: (e) => setEndTime(e.target.value),
                  placeholder: "HH:mm:ss"
                }
              )
            ] }),
            /* @__PURE__ */ jsx(
              DayPicker,
              {
                mode: "range",
                numberOfMonths,
                month,
                onMonthChange: setMonth,
                selected: { from, to },
                onSelect: (r) => {
                  if (r?.from) {
                    setFrom(r.from);
                    setTo(r.to ?? r.from);
                  }
                },
                showOutsideDays: true,
                hideNavigation: true,
                weekStartsOn: 0,
                ...allowFuture ? {} : { disabled: { after: /* @__PURE__ */ new Date() } },
                ...maxDays > 0 ? { max: maxDays } : {},
                formatters: { formatWeekdayName: (d) => "\u65E5\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D"[d.getDay()] },
                components: { MonthCaption: Caption, DayButton: DayBtn },
                classNames: {
                  months: "flex gap-6",
                  month: "",
                  month_grid: "border-collapse",
                  weekdays: "",
                  weekday: "text-xs text-muted-foreground font-normal w-9 h-8 text-center",
                  week: "",
                  day: "p-0 text-center align-middle",
                  range_middle: "bg-primary/10",
                  range_start: "bg-primary/10 rounded-l-full",
                  range_end: "bg-primary/10 rounded-r-full"
                }
              }
            ),
            /* @__PURE__ */ jsx("div", { className: "flex justify-end mt-2", children: /* @__PURE__ */ jsx(
              "button",
              {
                onClick: confirm,
                className: "h-8 px-5 text-sm rounded bg-foreground text-background hover:bg-foreground/90",
                children: "\u786E\u5B9A"
              }
            ) })
          ] })
        ]
      }
    )
  ] });
}
var Input = React18.forwardRef(
  ({ className, type, ...props }, ref) => {
    return /* @__PURE__ */ jsx(
      "input",
      {
        type,
        className: cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        ),
        ref,
        ...props
      }
    );
  }
);
Input.displayName = "Input";
var Textarea = React18.forwardRef(
  ({ className, ...props }, ref) => {
    return /* @__PURE__ */ jsx(
      "textarea",
      {
        className: cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        ),
        ref,
        ...props
      }
    );
  }
);
Textarea.displayName = "Textarea";
var Select = SelectPrimitive.Root;
var SelectGroup = SelectPrimitive.Group;
var SelectValue = SelectPrimitive.Value;
var SelectTrigger = React18.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ jsxs(
  SelectPrimitive.Trigger,
  {
    ref,
    className: cn(
      "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    ),
    ...props,
    children: [
      children,
      /* @__PURE__ */ jsx(SelectPrimitive.Icon, { asChild: true, children: /* @__PURE__ */ jsx(ChevronDown, { className: "h-4 w-4 opacity-50" }) })
    ]
  }
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;
var SelectScrollUpButton = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  SelectPrimitive.ScrollUpButton,
  {
    ref,
    className: cn(
      "flex cursor-default items-center justify-center py-1",
      className
    ),
    ...props,
    children: /* @__PURE__ */ jsx(ChevronUp, { className: "h-4 w-4" })
  }
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;
var SelectScrollDownButton = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  SelectPrimitive.ScrollDownButton,
  {
    ref,
    className: cn(
      "flex cursor-default items-center justify-center py-1",
      className
    ),
    ...props,
    children: /* @__PURE__ */ jsx(ChevronDown, { className: "h-4 w-4" })
  }
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;
var SelectContent = React18.forwardRef(({ className, children, position = "popper", ...props }, ref) => /* @__PURE__ */ jsx(SelectPrimitive.Portal, { children: /* @__PURE__ */ jsxs(
  SelectPrimitive.Content,
  {
    ref,
    className: cn(
      "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
      className
    ),
    position,
    ...props,
    children: [
      /* @__PURE__ */ jsx(SelectScrollUpButton, {}),
      /* @__PURE__ */ jsx(
        SelectPrimitive.Viewport,
        {
          className: cn(
            "p-1",
            position === "popper" && "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
          ),
          children
        }
      ),
      /* @__PURE__ */ jsx(SelectScrollDownButton, {})
    ]
  }
) }));
SelectContent.displayName = SelectPrimitive.Content.displayName;
var SelectLabel = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  SelectPrimitive.Label,
  {
    ref,
    className: cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className),
    ...props
  }
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;
var SelectItem = React18.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ jsxs(
  SelectPrimitive.Item,
  {
    ref,
    className: cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    ),
    ...props,
    children: [
      /* @__PURE__ */ jsx("span", { className: "absolute left-2 flex h-3.5 w-3.5 items-center justify-center", children: /* @__PURE__ */ jsx(SelectPrimitive.ItemIndicator, { children: /* @__PURE__ */ jsx(Check, { className: "h-4 w-4" }) }) }),
      /* @__PURE__ */ jsx(SelectPrimitive.ItemText, { children })
    ]
  }
));
SelectItem.displayName = SelectPrimitive.Item.displayName;
var SelectSeparator = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  SelectPrimitive.Separator,
  {
    ref,
    className: cn("-mx-1 my-1 h-px bg-muted", className),
    ...props
  }
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;
var Checkbox = React18.forwardRef(
  ({ className, onCheckedChange, checked, disabled, ...props }, ref) => {
    const internalRef = React18.useRef(null);
    const inputRef = ref || internalRef;
    const isIndeterminate = checked === "indeterminate";
    const isChecked = checked === true;
    React18.useEffect(() => {
      if (inputRef.current) inputRef.current.indeterminate = isIndeterminate;
    }, [isIndeterminate, inputRef]);
    const handleChange = (e) => {
      onCheckedChange?.(e.target.checked);
      props.onChange?.(e);
    };
    const handleClick = () => {
      if (disabled) return;
      if (inputRef.current) {
        inputRef.current.click();
      }
    };
    return /* @__PURE__ */ jsxs("div", { className: "relative", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "checkbox",
          ref: inputRef,
          className: "sr-only",
          onChange: handleChange,
          checked: isChecked,
          disabled,
          ...props
        }
      ),
      /* @__PURE__ */ jsxs(
        "div",
        {
          className: cn(
            "h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "transition-colors",
            disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
            isChecked || isIndeterminate ? "bg-primary text-primary-foreground border-primary" : cn("bg-background", !disabled && "hover:bg-muted"),
            className
          ),
          onClick: handleClick,
          children: [
            isChecked && /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center text-current", children: /* @__PURE__ */ jsx(Check, { className: "h-3 w-3" }) }),
            isIndeterminate && /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center text-current", children: /* @__PURE__ */ jsx("div", { className: "h-0.5 w-2 bg-current" }) })
          ]
        }
      )
    ] });
  }
);
Checkbox.displayName = "Checkbox";
var RadioGroupContext = React18.createContext({});
var RadioGroup = React18.forwardRef(
  ({ className, value, onValueChange, defaultValue, ...props }, ref) => {
    const [internalValue, setInternalValue] = React18.useState(defaultValue);
    const controlledValue = value !== void 0 ? value : internalValue;
    const handleValueChange = (newValue) => {
      if (value === void 0) {
        setInternalValue(newValue);
      }
      onValueChange?.(newValue);
    };
    return /* @__PURE__ */ jsx(RadioGroupContext.Provider, { value: { value: controlledValue, onValueChange: handleValueChange }, children: /* @__PURE__ */ jsx(
      "div",
      {
        ref,
        className: cn("space-y-2", className),
        ...props
      }
    ) });
  }
);
RadioGroup.displayName = "RadioGroup";
var RadioGroupItem = React18.forwardRef(
  ({ className, value, ...props }, ref) => {
    const context = React18.useContext(RadioGroupContext);
    const isChecked = context.value === value;
    const handleChange = (e) => {
      context.onValueChange?.(value);
      props.onChange?.(e);
    };
    return /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-2", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "radio",
          ref,
          value,
          checked: isChecked,
          onChange: handleChange,
          className: "sr-only",
          ...props
        }
      ),
      /* @__PURE__ */ jsx(
        "div",
        {
          className: cn(
            "h-4 w-4 shrink-0 rounded-full border border-primary ring-offset-background",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "cursor-pointer transition-colors",
            isChecked ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted",
            className
          ),
          onClick: () => {
            const input = ref;
            input.current?.click();
          },
          children: isChecked && /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center text-current", children: /* @__PURE__ */ jsx(Circle, { className: "h-2 w-2 fill-current" }) })
        }
      )
    ] });
  }
);
RadioGroupItem.displayName = "RadioGroupItem";
function Switch({
  checked = false,
  onCheckedChange,
  disabled = false,
  className
}) {
  const handleClick = () => {
    if (!disabled && onCheckedChange) {
      onCheckedChange(!checked);
    }
  };
  return /* @__PURE__ */ jsx(
    "button",
    {
      type: "button",
      role: "switch",
      "aria-checked": checked,
      disabled,
      onClick: handleClick,
      className: cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
        className
      ),
      children: /* @__PURE__ */ jsx(
        "span",
        {
          className: cn(
            "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
            checked ? "translate-x-4" : "translate-x-0"
          )
        }
      )
    }
  );
}
var toggleVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground"
      },
      size: {
        default: "h-10 px-3",
        sm: "h-9 px-2.5",
        lg: "h-11 px-5"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
var Toggle = React18.forwardRef(({ className, variant, size, ...props }, ref) => /* @__PURE__ */ jsx(
  TogglePrimitive.Root,
  {
    ref,
    className: cn(toggleVariants({ variant, size, className })),
    ...props
  }
));
Toggle.displayName = TogglePrimitive.Root.displayName;
var ToggleGroupContext = React18.createContext({
  size: "default",
  variant: "default"
});
var ToggleGroup = React18.forwardRef(({ className, variant, size, children, ...props }, ref) => /* @__PURE__ */ jsx(
  ToggleGroupPrimitive.Root,
  {
    ref,
    className: cn("flex items-center justify-center gap-1", className),
    ...props,
    children: /* @__PURE__ */ jsx(ToggleGroupContext.Provider, { value: { variant, size }, children })
  }
));
ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;
var ToggleGroupItem = React18.forwardRef(({ className, children, variant, size, ...props }, ref) => {
  const context = React18.useContext(ToggleGroupContext);
  return /* @__PURE__ */ jsx(
    ToggleGroupPrimitive.Item,
    {
      ref,
      className: cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size
        }),
        className
      ),
      ...props,
      children
    }
  );
});
ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;
var FormFieldContext = React18.createContext({
  id: ""
});
function useFormField() {
  return React18.useContext(FormFieldContext);
}
var Form = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx("form", { ref, className: cn("space-y-4", className), ...props }));
Form.displayName = "Form";
var FormField = React18.forwardRef(
  ({ id, error, className, children, ...props }, ref) => {
    const generatedId = React18.useId();
    const fieldId = id ?? generatedId;
    return /* @__PURE__ */ jsx(FormFieldContext.Provider, { value: { id: fieldId, error }, children: /* @__PURE__ */ jsx("div", { ref, className: cn("space-y-1", className), ...props, children }) });
  }
);
FormField.displayName = "FormField";
var FormLabel = React18.forwardRef(({ className, ...props }, ref) => {
  const { id, error } = useFormField();
  return /* @__PURE__ */ jsx(
    Label,
    {
      ref,
      htmlFor: id,
      className: cn(error && "text-destructive", className),
      ...props
    }
  );
});
FormLabel.displayName = "FormLabel";
var FormControl = React18.forwardRef(({ ...props }, ref) => {
  const { id, error } = useFormField();
  return /* @__PURE__ */ jsx(
    "div",
    {
      ref,
      id,
      "aria-invalid": !!error,
      "aria-describedby": error ? `${id}-message` : void 0,
      ...props
    }
  );
});
FormControl.displayName = "FormControl";
var FormDescription = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "p",
  {
    ref,
    className: cn("text-[0.8rem] text-muted-foreground", className),
    ...props
  }
));
FormDescription.displayName = "FormDescription";
var FormMessage = React18.forwardRef(({ className, children, ...props }, ref) => {
  const { id, error } = useFormField();
  const body = error ?? children;
  if (!body) return null;
  return /* @__PURE__ */ jsx(
    "p",
    {
      ref,
      id: `${id}-message`,
      className: cn("text-[0.8rem] font-medium text-destructive", className),
      ...props,
      children: body
    }
  );
});
FormMessage.displayName = "FormMessage";
function LabelEditor({
  value,
  onChange,
  initialValue,
  disabled = false,
  placeholderKey = "\u952E",
  placeholderValue = "\u503C",
  emptyText = "\u6682\u65E0\u6807\u7B7E",
  addButtonText = "\u6DFB\u52A0",
  showChangeDetection = false,
  maxHeight = "15rem"
}) {
  const [newItem, setNewItem] = useState({ key: "", value: "" });
  const [originalLabels, setOriginalLabels] = useState(initialValue || value);
  useEffect(() => {
    if (initialValue) {
      setOriginalLabels(initialValue);
    }
  }, [initialValue]);
  const handleAdd = () => {
    if (newItem.key && newItem.value) {
      onChange([...value, { ...newItem }]);
      setNewItem({ key: "", value: "" });
    }
  };
  const handleRemove = (index) => {
    onChange(value.filter((_, i) => i !== index));
  };
  const handleKeyChange = (index, key) => {
    const newLabels = [...value];
    newLabels[index].key = key;
    onChange(newLabels);
  };
  const handleValueChange = (index, newValue) => {
    const newLabels = [...value];
    newLabels[index].value = newValue;
    onChange(newLabels);
  };
  const hasChanges = () => {
    if (value.length !== originalLabels.length) {
      return true;
    }
    const valueMap = new Map(value.map((item) => [item.key, item.value]));
    const originalMap = new Map(originalLabels.map((item) => [item.key, item.value]));
    if (valueMap.size !== originalMap.size) {
      return true;
    }
    for (const [key, val] of Array.from(valueMap)) {
      if (originalMap.get(key) !== val) {
        return true;
      }
    }
    return false;
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxs("div", { className: "border rounded", children: [
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4 p-3 bg-muted border-b text-sm font-medium text-foreground", children: [
        /* @__PURE__ */ jsx("div", { children: placeholderKey }),
        /* @__PURE__ */ jsx("div", { children: placeholderValue })
      ] }),
      value.length === 0 ? /* @__PURE__ */ jsx("div", { className: "text-muted-foreground text-sm py-8 text-center", children: emptyText }) : /* @__PURE__ */ jsx("div", { className: "overflow-y-auto", style: { maxHeight }, children: value.map((item, index) => /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4 p-3 border-b last:border-b-0 items-center", children: [
        /* @__PURE__ */ jsx(
          Input,
          {
            value: item.key,
            onChange: (e) => handleKeyChange(index, e.target.value),
            placeholder: placeholderKey,
            disabled,
            className: "h-8 text-sm"
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsx(
            Input,
            {
              value: item.value,
              onChange: (e) => handleValueChange(index, e.target.value),
              placeholder: placeholderValue,
              disabled,
              className: "h-8 text-sm flex-1"
            }
          ),
          /* @__PURE__ */ jsx(
            Button,
            {
              variant: "outline",
              size: "sm",
              className: "h-8 w-8 p-0 text-muted-foreground hover:text-destructive border-input",
              onClick: () => handleRemove(index),
              disabled,
              children: /* @__PURE__ */ jsx(X, { className: "h-3 w-3" })
            }
          )
        ] })
      ] }, index)) })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "border-2 border-dashed border-input rounded p-4", children: /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
      /* @__PURE__ */ jsx(
        Input,
        {
          value: newItem.key,
          onChange: (e) => setNewItem((prev) => ({ ...prev, key: e.target.value })),
          placeholder: `\u65B0${placeholderKey}`,
          disabled,
          className: "text-sm"
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsx(
          Input,
          {
            value: newItem.value,
            onChange: (e) => setNewItem((prev) => ({ ...prev, value: e.target.value })),
            placeholder: `\u65B0${placeholderValue}`,
            disabled,
            className: "text-sm flex-1"
          }
        ),
        /* @__PURE__ */ jsx(
          Button,
          {
            onClick: handleAdd,
            disabled: !newItem.key || !newItem.value || disabled,
            size: "sm",
            className: "h-8 px-3 text-sm",
            children: addButtonText
          }
        )
      ] })
    ] }) }),
    showChangeDetection && hasChanges() && /* @__PURE__ */ jsx("div", { className: "text-sm text-primary", children: "\u6709\u672A\u4FDD\u5B58\u7684\u66F4\u6539" })
  ] });
}
function Pagination({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  className = "",
  pageSizeOptions = [5, 10, 15, 20, 50, 100]
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const handleChange = (page) => {
    if (page < 1 || page > totalPages) return;
    onPageChange(page);
  };
  return /* @__PURE__ */ jsx("div", { className, children: /* @__PURE__ */ jsx("div", { className: "p-3 bg-surface-toolbar", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between text-xs", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-4 text-muted-foreground", children: [
      onPageSizeChange && /* @__PURE__ */ jsxs("label", { className: "flex items-center space-x-2", children: [
        /* @__PURE__ */ jsx("span", { children: "\u6BCF\u9875\u663E\u793A\uFF1A" }),
        /* @__PURE__ */ jsxs(
          Select,
          {
            value: String(pageSize),
            onValueChange: (val) => {
              const v = Number(val);
              if (!isNaN(v)) onPageSizeChange(v);
            },
            children: [
              /* @__PURE__ */ jsx(SelectTrigger, { className: "h-6 text-xs w-[66px]", children: /* @__PURE__ */ jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsx(SelectContent, { children: pageSizeOptions.map((size) => /* @__PURE__ */ jsx(SelectItem, { value: String(size), children: size }, size)) })
            ]
          }
        ),
        /* @__PURE__ */ jsx("span", { children: "\u6761" })
      ] }),
      /* @__PURE__ */ jsxs("span", { children: [
        "\u603B\u6570\uFF1A",
        totalItems
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-2", children: [
      /* @__PURE__ */ jsx(
        Button,
        {
          variant: "outline",
          size: "sm",
          className: "h-8 w-8 p-0",
          onClick: () => handleChange(currentPage - 1),
          disabled: currentPage <= 1,
          children: "<"
        }
      ),
      /* @__PURE__ */ jsxs("span", { className: "px-3 text-foreground", children: [
        currentPage,
        " / ",
        totalPages
      ] }),
      /* @__PURE__ */ jsx(
        Button,
        {
          variant: "outline",
          size: "sm",
          className: "h-8 w-8 p-0",
          onClick: () => handleChange(currentPage + 1),
          disabled: currentPage >= totalPages,
          children: ">"
        }
      )
    ] })
  ] }) }) });
}
function Spinner({ size = "md", className }) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8"
  };
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: cn(
        "animate-spin rounded-full border-2 border-muted border-t-foreground",
        sizeClasses[size],
        className
      )
    }
  );
}
function Loading({ text = "\u52A0\u8F7D\u4E2D...", className }) {
  return /* @__PURE__ */ jsxs("div", { className: cn("flex flex-col items-center justify-center gap-3", className), children: [
    /* @__PURE__ */ jsx(Spinner, { size: "lg", className: "border-muted border-t-primary" }),
    /* @__PURE__ */ jsx("p", { className: "text-sm text-primary", children: text })
  ] });
}
function LoadingOverlay({ loading, text = "\u52A0\u8F7D\u4E2D...", className }) {
  if (!loading) return null;
  return /* @__PURE__ */ jsx("div", { className: cn("absolute top-12 left-0 right-0 bottom-0 flex items-center justify-center pointer-events-none z-10", className), children: /* @__PURE__ */ jsx(Loading, { text }) });
}
function EmptyState({ title = "\u6682\u65E0\u6570\u636E", icon: Icon2 = Package, loading = false }) {
  return /* @__PURE__ */ jsxs("div", { className: cn("p-8 text-center text-muted-foreground", loading && "opacity-60 pointer-events-none"), children: [
    /* @__PURE__ */ jsx(Icon2, { className: "h-12 w-12 mx-auto mb-4 text-muted-foreground/50" }),
    /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: title })
  ] });
}
var DropdownMenu = DropdownMenuPrimitive.Root;
var DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
var DropdownMenuGroup = DropdownMenuPrimitive.Group;
var DropdownMenuPortal = DropdownMenuPrimitive.Portal;
var DropdownMenuSub = DropdownMenuPrimitive.Sub;
var DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;
var DropdownMenuSubTrigger = React18.forwardRef(({ className, inset, children, ...props }, ref) => /* @__PURE__ */ jsxs(
  DropdownMenuPrimitive.SubTrigger,
  {
    ref,
    className: cn(
      "flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent",
      inset && "pl-8",
      className
    ),
    ...props,
    children: [
      children,
      /* @__PURE__ */ jsx(ChevronRight, { className: "ml-auto h-4 w-4" })
    ]
  }
));
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName;
var DropdownMenuSubContent = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  DropdownMenuPrimitive.SubContent,
  {
    ref,
    className: cn(
      "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    ),
    ...props
  }
));
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName;
var DropdownMenuContent = React18.forwardRef(({ className, sideOffset = 4, ...props }, ref) => /* @__PURE__ */ jsx(DropdownMenuPrimitive.Portal, { children: /* @__PURE__ */ jsx(
  DropdownMenuPrimitive.Content,
  {
    ref,
    sideOffset,
    className: cn(
      "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    ),
    ...props
  }
) }));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;
var DropdownMenuItem = React18.forwardRef(({ className, inset, ...props }, ref) => /* @__PURE__ */ jsx(
  DropdownMenuPrimitive.Item,
  {
    ref,
    className: cn(
      "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      inset && "pl-8",
      className
    ),
    ...props
  }
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;
var DropdownMenuCheckboxItem = React18.forwardRef(({ className, children, checked, ...props }, ref) => /* @__PURE__ */ jsxs(
  DropdownMenuPrimitive.CheckboxItem,
  {
    ref,
    className: cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    ),
    checked,
    ...props,
    children: [
      /* @__PURE__ */ jsx("span", { className: "absolute left-2 flex h-3.5 w-3.5 items-center justify-center", children: /* @__PURE__ */ jsx(DropdownMenuPrimitive.ItemIndicator, { children: /* @__PURE__ */ jsx(Check, { className: "h-4 w-4" }) }) }),
      children
    ]
  }
));
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName;
var DropdownMenuRadioItem = React18.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ jsxs(
  DropdownMenuPrimitive.RadioItem,
  {
    ref,
    className: cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    ),
    ...props,
    children: [
      /* @__PURE__ */ jsx("span", { className: "absolute left-2 flex h-3.5 w-3.5 items-center justify-center", children: /* @__PURE__ */ jsx(DropdownMenuPrimitive.ItemIndicator, { children: /* @__PURE__ */ jsx(Circle, { className: "h-2 w-2 fill-current" }) }) }),
      children
    ]
  }
));
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;
var DropdownMenuLabel = React18.forwardRef(({ className, inset, ...props }, ref) => /* @__PURE__ */ jsx(
  DropdownMenuPrimitive.Label,
  {
    ref,
    className: cn(
      "px-2 py-1.5 text-sm font-semibold",
      inset && "pl-8",
      className
    ),
    ...props
  }
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;
var DropdownMenuSeparator = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  DropdownMenuPrimitive.Separator,
  {
    ref,
    className: cn("-mx-1 my-1 h-px bg-muted", className),
    ...props
  }
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;
var DropdownMenuShortcut = ({
  className,
  ...props
}) => {
  return /* @__PURE__ */ jsx(
    "span",
    {
      className: cn("ml-auto text-xs tracking-widest opacity-60", className),
      ...props
    }
  );
};
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";
var TooltipProvider = TooltipPrimitive.Provider;
var Tooltip = TooltipPrimitive.Root;
var TooltipTrigger = TooltipPrimitive.Trigger;
var TooltipContent = React18.forwardRef(({ className, sideOffset = 4, ...props }, ref) => /* @__PURE__ */ jsx(
  TooltipPrimitive.Content,
  {
    ref,
    sideOffset,
    className: cn(
      "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    ),
    ...props
  }
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;
var Dialog = DialogPrimitive.Root;
var DialogTrigger = DialogPrimitive.Trigger;
var DialogPortal = DialogPrimitive.Portal;
var DialogClose = DialogPrimitive.Close;
var DialogOverlay = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  DialogPrimitive.Overlay,
  {
    ref,
    className: cn(
      // 遮罩恒定用黑色半透明，与 alert-dialog / sheet 一致（也是 shadcn 的基准）。
      // 曾是 bg-background/80 —— 那在浅色下算出来是 hsl(0 0% 100% / .8)，白色半透明，
      // 等于没有遮罩。遮罩的语义是「压暗背景」，不该跟随 --background 反转。
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    ),
    ...props
  }
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;
var DialogContent = React18.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ jsxs(DialogPortal, { children: [
  /* @__PURE__ */ jsx(DialogOverlay, {}),
  /* @__PURE__ */ jsxs(
    DialogPrimitive.Content,
    {
      ref,
      className: cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-lg",
        className
      ),
      ...props,
      children: [
        children,
        /* @__PURE__ */ jsxs(DialogPrimitive.Close, { className: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground", children: [
          /* @__PURE__ */ jsx(X, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Close" })
        ] })
      ]
    }
  )
] }));
DialogContent.displayName = DialogPrimitive.Content.displayName;
var DialogHeader = ({
  className,
  ...props
}) => /* @__PURE__ */ jsx(
  "div",
  {
    className: cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    ),
    ...props
  }
);
DialogHeader.displayName = "DialogHeader";
var DialogFooter = ({
  className,
  ...props
}) => /* @__PURE__ */ jsx(
  "div",
  {
    className: cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    ),
    ...props
  }
);
DialogFooter.displayName = "DialogFooter";
var DialogTitle = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  DialogPrimitive.Title,
  {
    ref,
    className: cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    ),
    ...props
  }
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;
var DialogDescription = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  DialogPrimitive.Description,
  {
    ref,
    className: cn("text-sm text-muted-foreground", className),
    ...props
  }
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  itemNames,
  onConfirm,
  loading = false
}) {
  const handleConfirm = async () => {
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
    }
  };
  return /* @__PURE__ */ jsx(Dialog, { open, onOpenChange, children: /* @__PURE__ */ jsxs(DialogContent, { className: "sm:max-w-[425px]", children: [
    /* @__PURE__ */ jsxs(DialogHeader, { children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-2", children: [
        /* @__PURE__ */ jsx(AlertTriangle, { className: "h-5 w-5 text-destructive" }),
        /* @__PURE__ */ jsx(DialogTitle, { className: "text-destructive", children: title })
      ] }),
      /* @__PURE__ */ jsx(DialogDescription, { className: "text-left", children: description })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "py-4", children: [
      /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-foreground mb-2", children: "\u5C06\u8981\u5220\u9664\u7684\u9879\u76EE\uFF1A" }),
      /* @__PURE__ */ jsx("div", { className: "max-h-32 overflow-y-auto border rounded p-2 bg-muted", children: itemNames.map((name, index) => /* @__PURE__ */ jsxs("div", { className: "text-sm text-foreground py-1", children: [
        "\u2022 ",
        name
      ] }, index)) })
    ] }),
    /* @__PURE__ */ jsxs(DialogFooter, { children: [
      /* @__PURE__ */ jsx(
        Button,
        {
          variant: "outline",
          onClick: () => onOpenChange(false),
          disabled: loading,
          children: "\u53D6\u6D88"
        }
      ),
      /* @__PURE__ */ jsx(
        Button,
        {
          variant: "destructive",
          onClick: handleConfirm,
          disabled: loading,
          children: loading ? "\u5220\u9664\u4E2D..." : "\u786E\u8BA4\u5220\u9664"
        }
      )
    ] })
  ] }) });
}
function resolveValue(val, row) {
  if (typeof val === "function") return val(row);
  return val ?? false;
}
function resolveString(val, row) {
  if (typeof val === "function") return val(row);
  return val;
}
function escapeCSV(value) {
  if (value === null || value === void 0) return "";
  const str = String(value);
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
function extractText(node) {
  if (node === null || node === void 0) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(extractText).join(" ").trim();
  if (React18.isValidElement(node)) return extractText(node.props.children);
  return "";
}
function cellText(row, col, index = 0) {
  if (col.exportFormatter) return col.exportFormatter(row);
  if (col.render) return extractText(col.render(row, index));
  const val = row[col.key];
  return val !== void 0 && val !== null ? String(val) : "";
}
function downloadCSV(rows, filename) {
  const content = rows.map((row) => row.map(escapeCSV).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.style.visibility = "hidden";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function matchesFilter(row, col, value) {
  const raw = cellText(row, col);
  if (col.searchType === "select") return raw === value;
  return raw.toLowerCase().includes(value.toLowerCase());
}
var SELECTION_COL_WIDTH = 40;
var FIXED_COL_FALLBACK_WIDTH = 150;
function DataTable({
  data,
  loading = false,
  mode = "remote",
  rowKey = "name",
  columns,
  currentPage: externalPage,
  pageSize: externalPageSize,
  totalItems: externalTotal,
  pageSizes = [10, 20, 50, 100],
  onPageChange,
  onPageSizeChange,
  rowActions,
  collapsedActions = true,
  maxVisibleActions = 1,
  deleteConfig,
  actionsTitle = "",
  stickyActions = true,
  actionsWidth = 120,
  batchActions,
  toolbarLeft,
  toolbarRight,
  toolbarExtra,
  showRefresh = false,
  showColumnToggle = false,
  showSelection = false,
  isRowSelectable,
  exportConfig,
  onRefresh,
  onSelectionChange,
  onSearch,
  emptyText = "\u6682\u65E0\u6570\u636E",
  minWidth,
  className,
  title,
  titleExtra
}) {
  const searchableColumns = React18.useMemo(() => columns.filter((c) => c.searchable), [columns]);
  const isSingleSearch = searchableColumns.length === 1;
  const isMultiSearch = searchableColumns.length > 1;
  const [singleValue, setSingleValue] = React18.useState("");
  const [activeFilters, setActiveFilters] = React18.useState([]);
  const [pendingField, setPendingField] = React18.useState(() => searchableColumns[0]?.key ?? "");
  const [pendingValue, setPendingValue] = React18.useState("");
  const [dropdownOpen, setDropdownOpen] = React18.useState(false);
  const searchContainerRef = React18.useRef(null);
  const searchInputRef = React18.useRef(null);
  React18.useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (!searchContainerRef.current?.contains(e.target)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);
  const pendingFieldDef = searchableColumns.find((c) => c.key === pendingField);
  const commitFilter = (key, value) => {
    if (!key || !value) return;
    const next = [...activeFilters.filter((f) => f.key !== key), { key, value }];
    setActiveFilters(next);
    setPendingValue("");
    onSearch?.(next);
    const filteredKeys = new Set(next.map((f) => f.key));
    const nextField = searchableColumns.find((c) => !filteredKeys.has(c.key))?.key ?? searchableColumns[0]?.key ?? "";
    if (nextField) setPendingField(nextField);
  };
  const removeFilter = (key) => {
    const next = activeFilters.filter((f) => f.key !== key);
    setActiveFilters(next);
    onSearch?.(next);
  };
  const clearAllFilters = () => {
    setActiveFilters([]);
    onSearch?.([]);
  };
  React18.useEffect(() => {
    if (!isSingleSearch || !onSearch) return;
    onSearch(singleValue ? [{ key: searchableColumns[0].key, value: singleValue }] : []);
  }, [singleValue, isSingleSearch]);
  const [internalPage, setInternalPage] = React18.useState(1);
  const [internalPageSize, setInternalPageSize] = React18.useState(externalPageSize ?? 10);
  React18.useEffect(() => {
    if (mode === "static") setInternalPage(1);
  }, [singleValue, activeFilters, mode]);
  const currentPage = mode === "static" ? internalPage : externalPage ?? 1;
  const pageSize = mode === "static" ? internalPageSize : externalPageSize ?? 10;
  const handlePageChange = (page) => {
    if (mode === "static") setInternalPage(page);
    onPageChange?.(page);
  };
  const handlePageSizeChange = (size) => {
    if (mode === "static") {
      setInternalPageSize(size);
      setInternalPage(1);
    }
    onPageSizeChange?.(size);
  };
  const filteredData = React18.useMemo(() => {
    if (mode !== "static") return data;
    let result = data;
    if (isSingleSearch && singleValue) {
      const col = searchableColumns[0];
      result = result.filter((row) => matchesFilter(row, col, singleValue));
    } else if (isMultiSearch && activeFilters.length > 0) {
      result = result.filter(
        (row) => activeFilters.every((f) => {
          const col = searchableColumns.find((c) => c.key === f.key);
          return col ? matchesFilter(row, col, f.value) : true;
        })
      );
    }
    return result;
  }, [data, mode, isSingleSearch, isMultiSearch, singleValue, activeFilters, searchableColumns]);
  const totalItems = mode === "static" ? filteredData.length : externalTotal ?? 0;
  const displayData = React18.useMemo(() => {
    if (mode !== "static") return data;
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, data, mode, currentPage, pageSize]);
  const [hiddenColumns, setHiddenColumns] = React18.useState(
    () => new Set(columns.filter((c) => c.hide).map((c) => c.key))
  );
  const visibleColumns = React18.useMemo(
    () => columns.filter((c) => !hiddenColumns.has(c.key)),
    [columns, hiddenColumns]
  );
  const toggleColumn = (key) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };
  const [selected, setSelected] = React18.useState(/* @__PURE__ */ new Set());
  const getRowId = (row) => String(row[rowKey] ?? "");
  const canSelect = (row) => isRowSelectable ? isRowSelectable(row) : true;
  const selectableIds = React18.useMemo(() => displayData.filter(canSelect).map(getRowId), [displayData, isRowSelectable]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someSelected = selectableIds.some((id) => selected.has(id)) && !allSelected;
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) {
      selectableIds.forEach((id) => next.delete(id));
    } else {
      selectableIds.forEach((id) => next.add(id));
    }
    setSelected(next);
    onSelectionChange?.(data.filter((row) => next.has(getRowId(row))));
  };
  const toggleRow = (row) => {
    if (!canSelect(row)) return;
    const id = getRowId(row);
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
    onSelectionChange?.(data.filter((r) => next.has(getRowId(r))));
  };
  const selectedRows = React18.useMemo(
    () => data.filter((row) => selected.has(getRowId(row))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, selected]
  );
  const getActions = (row) => {
    const base = typeof rowActions === "function" ? rowActions(row) : rowActions ?? [];
    const all = [...base];
    if (deleteConfig && !resolveValue(deleteConfig.hidden, row)) {
      all.push({
        label: deleteConfig.buttonText ?? "\u5220\u9664",
        danger: true,
        disabled: deleteConfig.disabled,
        onClick: () => {
          setDeleteTarget(row);
          setDeleteOpen(true);
        }
      });
    }
    return all.filter((a) => !resolveValue(a.hidden, row));
  };
  const primaryActions = (row) => {
    const all = getActions(row);
    return collapsedActions ? all.slice(0, maxVisibleActions) : all;
  };
  const moreActions = (row) => {
    if (!collapsedActions) return [];
    return getActions(row).slice(maxVisibleActions);
  };
  const [deleteOpen, setDeleteOpen] = React18.useState(false);
  const [deleteTarget, setDeleteTarget] = React18.useState(null);
  const [deleteLoading, setDeleteLoading] = React18.useState(false);
  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !deleteConfig) return;
    setDeleteLoading(true);
    try {
      await deleteConfig.onDelete(deleteTarget);
      setDeleteOpen(false);
      setDeleteTarget(null);
      onRefresh?.();
    } finally {
      setDeleteLoading(false);
    }
  };
  const deleteItemName = deleteTarget ? String(deleteTarget[deleteConfig?.rowNameKey ?? deleteConfig?.rowKey ?? rowKey] ?? "") : "";
  const deleteConfirmText = deleteTarget && deleteConfig?.confirmText ? resolveString(deleteConfig.confirmText, deleteTarget) : "\u5220\u9664\u540E\u5C06\u65E0\u6CD5\u6062\u590D\uFF0C\u8BF7\u786E\u8BA4\u64CD\u4F5C\u3002";
  const [exportLoading, setExportLoading] = React18.useState(false);
  const handleExport = async () => {
    if (exportLoading) return;
    setExportLoading(true);
    try {
      const exportData = mode === "static" ? filteredData : displayData;
      let rows;
      if (exportConfig?.customExport) {
        rows = exportConfig.customExport(exportData, columns);
      } else {
        const headers = columns.map((c) => c.title);
        const body = exportData.map(
          (row, i) => columns.map((c) => cellText(row, c, i))
        );
        rows = [headers, ...body];
      }
      downloadCSV(rows, exportConfig?.filename ?? "export");
    } finally {
      setExportLoading(false);
    }
  };
  const showActionsColumn = data.some((row) => getActions(row).length > 0);
  const colWidthPx = (col) => typeof col.width === "number" ? col.width : FIXED_COL_FALLBACK_WIDTH;
  const hasLeftFixed = visibleColumns.some((c) => c.fixed === "left");
  const pinnedOffsets = React18.useMemo(() => {
    const map = {};
    let leftAcc = showSelection ? SELECTION_COL_WIDTH : 0;
    for (const col of visibleColumns) {
      if (col.fixed === "left") {
        map[col.key] = { side: "left", offset: leftAcc };
        leftAcc += colWidthPx(col);
      }
    }
    let rightAcc = showActionsColumn && stickyActions ? actionsWidth : 0;
    for (let i = visibleColumns.length - 1; i >= 0; i--) {
      const col = visibleColumns[i];
      if (col.fixed === "right") {
        map[col.key] = { side: "right", offset: rightAcc };
        rightAcc += colWidthPx(col);
      }
    }
    return map;
  }, [visibleColumns, showSelection, showActionsColumn, stickyActions, actionsWidth]);
  const pinnedCellClass = (col, hover) => {
    const pin = pinnedOffsets[col.key];
    if (!pin) return "";
    return cn(
      "sticky bg-card z-10",
      hover && "group-hover:bg-muted/50"
    );
  };
  const pinnedCellStyle = (col) => {
    const pin = pinnedOffsets[col.key];
    if (!pin) return {};
    return pin.side === "left" ? { left: pin.offset } : { right: pin.offset };
  };
  const tableMinWidth = React18.useMemo(() => {
    let total = showSelection ? SELECTION_COL_WIDTH : 0;
    for (const col of visibleColumns) total += colWidthPx(col);
    if (showActionsColumn) total += actionsWidth || FIXED_COL_FALLBACK_WIDTH;
    return total;
  }, [visibleColumns, showSelection, showActionsColumn, actionsWidth]);
  const hasSearch = searchableColumns.length > 0;
  const hasToolbar = !!(batchActions || toolbarLeft || toolbarRight || toolbarExtra || showRefresh || showColumnToggle || exportConfig || hasSearch);
  return /* @__PURE__ */ jsxs(TooltipProvider, { children: [
    /* @__PURE__ */ jsxs("div", { className: cn("bg-card border border-border rounded shadow-sm overflow-hidden", className), children: [
      title && /* @__PURE__ */ jsxs("div", { className: "px-4 py-3 border-b border-border/50 flex items-center justify-between gap-3", children: [
        /* @__PURE__ */ jsx("span", { className: "text-sm font-medium text-foreground", children: title }),
        titleExtra
      ] }),
      hasToolbar && /* @__PURE__ */ jsxs("div", { style: { backgroundColor: "#F9FBFD" }, children: [
        /* @__PURE__ */ jsxs("div", { className: "p-4 flex items-center gap-3", children: [
          hasSearch && /* @__PURE__ */ jsx("div", { className: "flex-1 min-w-0", children: isSingleSearch ? (
            // ── Single field: live text search ──
            /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx(Search, { className: "absolute left-2.5 top-2 h-4 w-4 text-muted-foreground pointer-events-none" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  className: "w-full h-8 pl-8 pr-7 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring",
                  placeholder: `\u641C\u7D22 ${searchableColumns[0].title}...`,
                  value: singleValue,
                  onChange: (e) => setSingleValue(e.target.value)
                }
              ),
              singleValue && /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: () => setSingleValue(""),
                  className: "absolute right-2 top-2 text-muted-foreground hover:text-muted-foreground",
                  children: /* @__PURE__ */ jsx(X, { className: "h-4 w-4" })
                }
              )
            ] })
          ) : (
            // ── Multi field: chip bar + custom dropdown panel ──
            /* @__PURE__ */ jsxs("div", { className: "relative", ref: searchContainerRef, children: [
              /* @__PURE__ */ jsxs(
                "div",
                {
                  className: cn(
                    "flex items-center flex-wrap gap-1 min-h-8 px-2 py-1 border rounded bg-background cursor-text",
                    dropdownOpen ? "border-ring ring-1 ring-ring" : "border-border"
                  ),
                  onClick: () => {
                    setDropdownOpen(true);
                    setTimeout(() => searchInputRef.current?.focus(), 0);
                  },
                  children: [
                    /* @__PURE__ */ jsx(Search, { className: "h-3.5 w-3.5 text-muted-foreground flex-shrink-0" }),
                    activeFilters.map((f) => {
                      const col = searchableColumns.find((c) => c.key === f.key);
                      const displayVal = col?.searchOptions?.find((o) => o.value === f.value)?.label ?? f.value;
                      return /* @__PURE__ */ jsxs(
                        "span",
                        {
                          className: "inline-flex items-center gap-1 h-5 px-1.5 text-xs bg-primary/10 text-primary rounded border border-primary/30 flex-shrink-0",
                          children: [
                            col?.title,
                            ": ",
                            displayVal,
                            /* @__PURE__ */ jsx(
                              "button",
                              {
                                onMouseDown: (e) => {
                                  e.stopPropagation();
                                  removeFilter(f.key);
                                },
                                className: "hover:text-primary/80",
                                children: /* @__PURE__ */ jsx(X, { className: "h-3 w-3" })
                              }
                            )
                          ]
                        },
                        f.key
                      );
                    }),
                    activeFilters.length === 0 && /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: "\u641C\u7D22..." }),
                    activeFilters.length > 0 && /* @__PURE__ */ jsx(
                      "button",
                      {
                        onMouseDown: (e) => {
                          e.stopPropagation();
                          clearAllFilters();
                        },
                        className: "ml-auto flex-shrink-0 text-muted-foreground hover:text-muted-foreground",
                        children: /* @__PURE__ */ jsx(X, { className: "h-4 w-4" })
                      }
                    )
                  ]
                }
              ),
              dropdownOpen && /* @__PURE__ */ jsxs("div", { className: "absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded shadow-lg z-50", children: [
                /* @__PURE__ */ jsx("div", { className: "flex items-center gap-1 px-2 pt-2 pb-1.5 border-b border-border/50 flex-wrap", children: searchableColumns.map((col) => /* @__PURE__ */ jsxs(
                  "button",
                  {
                    onMouseDown: (e) => {
                      e.preventDefault();
                      setPendingField(col.key);
                      setPendingValue("");
                      searchInputRef.current?.focus();
                    },
                    className: cn(
                      "px-2 py-0.5 text-xs rounded border transition-colors",
                      pendingField === col.key ? "bg-primary/10 text-primary border-primary/30" : "text-muted-foreground border-transparent hover:bg-muted/50"
                    ),
                    children: [
                      col.title,
                      activeFilters.find((f) => f.key === col.key) && /* @__PURE__ */ jsx("span", { className: "ml-1 inline-block w-1.5 h-1.5 bg-primary rounded-full align-middle" })
                    ]
                  },
                  col.key
                )) }),
                /* @__PURE__ */ jsx("div", { className: "p-2", children: pendingFieldDef?.searchType === "select" ? /* @__PURE__ */ jsx("div", { className: "space-y-0.5 max-h-48 overflow-y-auto", children: pendingFieldDef.searchOptions?.map((o) => /* @__PURE__ */ jsx(
                  "button",
                  {
                    onMouseDown: () => {
                      commitFilter(pendingField, o.value);
                      setDropdownOpen(false);
                    },
                    className: cn(
                      "w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted/50",
                      activeFilters.find((f) => f.key === pendingField && f.value === o.value) ? "text-primary bg-primary/10" : "text-foreground"
                    ),
                    children: o.label
                  },
                  o.value
                )) }) : /* @__PURE__ */ jsx(
                  "input",
                  {
                    ref: searchInputRef,
                    value: pendingValue,
                    onChange: (e) => setPendingValue(e.target.value),
                    onKeyDown: (e) => {
                      if (e.key === "Enter" && pendingValue.trim()) {
                        commitFilter(pendingField, pendingValue.trim());
                        setDropdownOpen(false);
                      }
                      if (e.key === "Escape") setDropdownOpen(false);
                      if (e.key === "Backspace" && !pendingValue && activeFilters.length > 0) {
                        removeFilter(activeFilters[activeFilters.length - 1].key);
                      }
                    },
                    placeholder: `\u8F93\u5165${pendingFieldDef?.title ?? ""}\uFF0CEnter \u786E\u8BA4`,
                    className: "w-full h-7 px-2 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring",
                    autoFocus: true
                  }
                ) })
              ] })
            ] })
          ) }),
          toolbarLeft && /* @__PURE__ */ jsx("div", { className: "flex items-center gap-3 flex-shrink-0", children: toolbarLeft }),
          batchActions && selected.size > 0 && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 flex-shrink-0", children: [
            /* @__PURE__ */ jsxs("span", { className: "text-xs text-muted-foreground whitespace-nowrap", children: [
              "\u5DF2\u9009 ",
              selected.size,
              " \u9879"
            ] }),
            batchActions.map((action, i) => {
              const isDisabled = action.disabled?.(selectedRows) ?? false;
              return /* @__PURE__ */ jsx(
                Button,
                {
                  variant: "outline",
                  size: "sm",
                  className: "h-8 text-xs",
                  disabled: isDisabled,
                  onClick: () => action.onClick(selectedRows),
                  children: typeof action.label === "function" ? action.label(selectedRows) : action.label
                },
                i
              );
            })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 flex-shrink-0 ml-auto", children: [
            showColumnToggle && /* @__PURE__ */ jsxs(DropdownMenu, { children: [
              /* @__PURE__ */ jsx(DropdownMenuTrigger, { asChild: true, children: /* @__PURE__ */ jsx(Button, { variant: "outline", size: "sm", className: "h-8 w-8 p-0", title: "\u5217\u663E\u9690", children: /* @__PURE__ */ jsx(Columns, { className: "h-4 w-4" }) }) }),
              /* @__PURE__ */ jsx(DropdownMenuContent, { align: "end", className: "w-40", children: columns.map((col) => /* @__PURE__ */ jsx(
                DropdownMenuCheckboxItem,
                {
                  checked: !hiddenColumns.has(col.key),
                  onCheckedChange: () => toggleColumn(col.key),
                  children: col.title
                },
                col.key
              )) })
            ] }),
            exportConfig && /* @__PURE__ */ jsx(
              Button,
              {
                variant: "outline",
                size: "sm",
                className: "h-8 w-8 p-0",
                title: "\u5BFC\u51FA CSV",
                onClick: handleExport,
                disabled: exportLoading,
                children: /* @__PURE__ */ jsx(Download, { className: cn("h-4 w-4", exportLoading && "animate-pulse") })
              }
            ),
            showRefresh && /* @__PURE__ */ jsx(
              Button,
              {
                variant: "outline",
                size: "sm",
                className: "h-8 w-8 p-0",
                title: "\u5237\u65B0",
                onClick: onRefresh,
                disabled: loading,
                children: /* @__PURE__ */ jsx(RotateCw, { className: cn("h-4 w-4", loading && "animate-spin") })
              }
            ),
            toolbarRight
          ] })
        ] }),
        toolbarExtra && /* @__PURE__ */ jsx("div", { className: "px-4 pb-3", children: toolbarExtra })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "overflow-x-auto relative", children: [
        /* @__PURE__ */ jsxs(
          "table",
          {
            className: "w-full text-xs",
            style: { tableLayout: "fixed", minWidth: minWidth ?? tableMinWidth },
            children: [
              /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { className: "h-12 border-b border-border bg-card", children: [
                showSelection && /* @__PURE__ */ jsx("th", { className: cn("w-10 px-4", hasLeftFixed && "sticky left-0 bg-card z-10"), children: /* @__PURE__ */ jsx(
                  Checkbox,
                  {
                    checked: someSelected ? "indeterminate" : allSelected,
                    onCheckedChange: toggleAll
                  }
                ) }),
                visibleColumns.map((col) => /* @__PURE__ */ jsx(
                  "th",
                  {
                    className: cn("px-3 text-left font-medium text-foreground whitespace-nowrap", pinnedCellClass(col, false)),
                    style: {
                      // table-layout:fixed needs every column to have a width, or width-less
                      // columns collapse and overlap in a horizontally-scrollable table.
                      // Explicit widths are used as-is; unsized columns fall back to 150px.
                      width: col.width ?? FIXED_COL_FALLBACK_WIDTH,
                      ...pinnedCellStyle(col)
                    },
                    children: col.title
                  },
                  col.key
                )),
                showActionsColumn && /* @__PURE__ */ jsx(
                  "th",
                  {
                    className: cn(
                      "px-3 text-left font-medium text-foreground whitespace-nowrap",
                      stickyActions && "sticky right-0 bg-card z-10 border-l border-border/50"
                    ),
                    style: { width: actionsWidth },
                    children: actionsTitle
                  }
                )
              ] }) }),
              /* @__PURE__ */ jsx("tbody", { className: loading ? "opacity-60 pointer-events-none" : "", children: displayData.length === 0 ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: visibleColumns.length + (showSelection ? 1 : 0) + (showActionsColumn ? 1 : 0), children: /* @__PURE__ */ jsx(EmptyState, { title: emptyText, loading }) }) }) : displayData.map((row, index) => {
                const rowId = getRowId(row);
                const primary = primaryActions(row);
                const more = moreActions(row);
                return /* @__PURE__ */ jsxs("tr", { className: "h-12 border-b border-border/50 hover:bg-muted/50 group", children: [
                  showSelection && /* @__PURE__ */ jsx("td", { className: cn("px-4", hasLeftFixed && "sticky left-0 bg-card z-10 group-hover:bg-muted/50"), children: /* @__PURE__ */ jsx(
                    Checkbox,
                    {
                      checked: selected.has(rowId),
                      disabled: !canSelect(row),
                      onCheckedChange: () => toggleRow(row)
                    }
                  ) }),
                  visibleColumns.map((col) => /* @__PURE__ */ jsx(
                    "td",
                    {
                      className: cn("px-3 text-foreground overflow-hidden", pinnedCellClass(col, true), col.className),
                      style: pinnedCellStyle(col),
                      children: col.render ? col.render(row, index) : row[col.key] !== void 0 && row[col.key] !== null ? String(row[col.key]) : /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "-" })
                    },
                    col.key
                  )),
                  showActionsColumn && /* @__PURE__ */ jsx(
                    "td",
                    {
                      className: cn(
                        "px-3 group-hover:bg-muted/50",
                        stickyActions && "sticky right-0 bg-card z-10 border-l border-border/50"
                      ),
                      onClick: (e) => e.stopPropagation(),
                      children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-start gap-1 whitespace-nowrap", children: [
                        primary.map((action, i) => {
                          const isDisabled = resolveValue(action.disabled, row);
                          const tip = resolveString(action.tooltip, row);
                          const btn = /* @__PURE__ */ jsx(
                            "button",
                            {
                              disabled: isDisabled,
                              onClick: () => !isDisabled && action.onClick(row, index),
                              className: cn(
                                "h-6 px-2 text-xs rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed",
                                action.danger ? "text-destructive hover:text-destructive/80" : "text-primary hover:text-primary/80"
                              ),
                              children: action.label
                            },
                            i
                          );
                          if (tip) {
                            return /* @__PURE__ */ jsxs(Tooltip, { children: [
                              /* @__PURE__ */ jsx(TooltipTrigger, { asChild: true, children: btn }),
                              /* @__PURE__ */ jsx(TooltipContent, { children: tip })
                            ] }, i);
                          }
                          return btn;
                        }),
                        more.length > 0 && /* @__PURE__ */ jsxs(DropdownMenu, { children: [
                          /* @__PURE__ */ jsx(DropdownMenuTrigger, { asChild: true, children: /* @__PURE__ */ jsx("button", { className: "h-6 w-6 p-0 inline-flex items-center justify-center rounded hover:bg-accent", children: /* @__PURE__ */ jsx(MoreHorizontal, { className: "h-4 w-4 text-muted-foreground" }) }) }),
                          /* @__PURE__ */ jsx(DropdownMenuContent, { align: "end", children: more.map((action, i) => {
                            const isDisabled = resolveValue(action.disabled, row);
                            return /* @__PURE__ */ jsxs(React18.Fragment, { children: [
                              action.danger && i > 0 && /* @__PURE__ */ jsx(DropdownMenuSeparator, {}),
                              /* @__PURE__ */ jsx(
                                DropdownMenuItem,
                                {
                                  disabled: isDisabled,
                                  onClick: () => !isDisabled && action.onClick(row, index),
                                  className: action.danger ? "text-destructive focus:text-destructive" : "",
                                  children: action.label
                                }
                              )
                            ] }, i);
                          }) })
                        ] })
                      ] })
                    }
                  )
                ] }, rowId || index);
              }) })
            ]
          }
        ),
        /* @__PURE__ */ jsx(LoadingOverlay, { loading })
      ] }),
      /* @__PURE__ */ jsx(
        Pagination,
        {
          currentPage,
          pageSize,
          totalItems,
          pageSizeOptions: pageSizes,
          onPageChange: handlePageChange,
          onPageSizeChange: handlePageSizeChange
        }
      )
    ] }),
    deleteConfig && /* @__PURE__ */ jsx(
      ConfirmDeleteDialog,
      {
        open: deleteOpen,
        onOpenChange: (open) => {
          setDeleteOpen(open);
          if (!open) setDeleteTarget(null);
        },
        title: deleteConfig.confirmTitle ?? "\u786E\u8BA4\u5220\u9664",
        description: deleteConfirmText ?? "\u5220\u9664\u540E\u5C06\u65E0\u6CD5\u6062\u590D\uFF0C\u8BF7\u786E\u8BA4\u64CD\u4F5C\u3002",
        itemNames: deleteItemName ? [deleteItemName] : [],
        onConfirm: handleDeleteConfirm,
        loading: deleteLoading
      }
    )
  ] });
}
var columnClasses = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4"
};
var spanClasses = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4"
};
function PropertyList({
  items,
  columns = 3,
  className,
  labelClassName,
  valueClassName
}) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: cn(
        "grid gap-x-12 gap-y-3 text-sm",
        columnClasses[columns],
        className
      ),
      children: items.map((item, index) => /* @__PURE__ */ jsxs(
        "div",
        {
          className: cn(
            "flex items-center min-w-0",
            item.span && item.span > 1 ? spanClasses[item.span] : void 0
          ),
          children: [
            /* @__PURE__ */ jsxs(
              "span",
              {
                className: cn(
                  "text-muted-foreground shrink-0 mr-2",
                  labelClassName
                ),
                children: [
                  item.label,
                  ":"
                ]
              }
            ),
            /* @__PURE__ */ jsx("span", { className: cn("text-foreground truncate", valueClassName), children: item.value })
          ]
        },
        index
      ))
    }
  );
}
var Card = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "div",
  {
    ref,
    className: cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className
    ),
    ...props
  }
));
Card.displayName = "Card";
var CardHeader = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "div",
  {
    ref,
    className: cn("flex flex-col space-y-1.5 p-4", className),
    ...props
  }
));
CardHeader.displayName = "CardHeader";
var CardTitle = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "h3",
  {
    ref,
    className: cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    ),
    ...props
  }
));
CardTitle.displayName = "CardTitle";
var CardDescription = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "p",
  {
    ref,
    className: cn("text-sm text-muted-foreground", className),
    ...props
  }
));
CardDescription.displayName = "CardDescription";
var CardContent = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx("div", { ref, className: cn("p-4 pt-0", className), ...props }));
CardContent.displayName = "CardContent";
var CardFooter = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "div",
  {
    ref,
    className: cn("flex items-center p-4 pt-0", className),
    ...props
  }
));
CardFooter.displayName = "CardFooter";
var Table = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx("div", { className: "relative w-full overflow-auto", children: /* @__PURE__ */ jsx(
  "table",
  {
    ref,
    className: cn("w-full caption-bottom text-sm", className),
    ...props
  }
) }));
Table.displayName = "Table";
var TableHeader = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx("thead", { ref, className: cn("[&_tr]:border-b", className), ...props }));
TableHeader.displayName = "TableHeader";
var TableBody = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "tbody",
  {
    ref,
    className: cn("[&_tr:last-child]:border-0", className),
    ...props
  }
));
TableBody.displayName = "TableBody";
var TableFooter = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "tfoot",
  {
    ref,
    className: cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className),
    ...props
  }
));
TableFooter.displayName = "TableFooter";
var TableRow = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "tr",
  {
    ref,
    className: cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className
    ),
    ...props
  }
));
TableRow.displayName = "TableRow";
var TableHead = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "th",
  {
    ref,
    className: cn(
      "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
      className
    ),
    ...props
  }
));
TableHead.displayName = "TableHead";
var TableCell = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "td",
  {
    ref,
    className: cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className),
    ...props
  }
));
TableCell.displayName = "TableCell";
var TableCaption = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "caption",
  {
    ref,
    className: cn("mt-4 text-sm text-muted-foreground", className),
    ...props
  }
));
TableCaption.displayName = "TableCaption";
var Tabs = TabsPrimitive.Root;
var TabsList = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  TabsPrimitive.List,
  {
    ref,
    className: cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    ),
    ...props
  }
));
TabsList.displayName = TabsPrimitive.List.displayName;
var TabsTrigger = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  TabsPrimitive.Trigger,
  {
    ref,
    className: cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    ),
    ...props
  }
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;
var TabsContent = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  TabsPrimitive.Content,
  {
    ref,
    className: cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    ),
    ...props
  }
));
TabsContent.displayName = TabsPrimitive.Content.displayName;
var NumberField = React18.forwardRef(
  ({ value, onValueChange, min, max, step = 1, disabled, className, ...props }, ref) => {
    const [draft, setDraft] = React18.useState(null);
    const clamp = React18.useCallback(
      (n) => {
        let v = n;
        if (min !== void 0) v = Math.max(min, v);
        if (max !== void 0) v = Math.min(max, v);
        return v;
      },
      [min, max]
    );
    const commit = (raw) => {
      setDraft(null);
      const n = Number(raw);
      if (raw.trim() !== "" && Number.isFinite(n)) {
        const next = clamp(n);
        if (next !== value) onValueChange(next);
      }
    };
    const nudge = (delta) => {
      setDraft(null);
      const next = clamp(value + delta);
      if (next !== value) onValueChange(next);
    };
    const atMin = min !== void 0 && value <= min;
    const atMax = max !== void 0 && value >= max;
    return /* @__PURE__ */ jsxs("div", { className: cn("relative", className), children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          tabIndex: -1,
          "aria-label": "\u51CF\u5C11",
          disabled: disabled || atMin,
          onClick: () => nudge(-step),
          className: "absolute left-0 top-1/2 -translate-y-1/2 p-3 disabled:cursor-not-allowed disabled:opacity-20",
          children: /* @__PURE__ */ jsx(Minus, { className: "size-4" })
        }
      ),
      /* @__PURE__ */ jsx(
        "input",
        {
          ref,
          type: "text",
          inputMode: "numeric",
          role: "spinbutton",
          "aria-valuenow": value,
          "aria-valuemin": min,
          "aria-valuemax": max,
          disabled,
          value: draft ?? String(value),
          onChange: (e) => setDraft(e.target.value),
          onBlur: (e) => commit(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") commit(e.currentTarget.value);
            else if (e.key === "ArrowUp") {
              e.preventDefault();
              nudge(step);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              nudge(-step);
            }
          },
          className: "flex h-9 w-full rounded-md border border-input bg-transparent px-5 py-1 text-center text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          ...props
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          tabIndex: -1,
          "aria-label": "\u589E\u52A0",
          disabled: disabled || atMax,
          onClick: () => nudge(step),
          className: "absolute right-0 top-1/2 -translate-y-1/2 p-3 disabled:cursor-not-allowed disabled:opacity-20",
          children: /* @__PURE__ */ jsx(Plus, { className: "size-4" })
        }
      )
    ] });
  }
);
NumberField.displayName = "NumberField";
var Progress = React18.forwardRef(({ className, value, ...props }, ref) => /* @__PURE__ */ jsx(
  ProgressPrimitive.Root,
  {
    ref,
    className: cn(
      "relative h-4 w-full overflow-hidden rounded-full bg-secondary",
      className
    ),
    ...props,
    children: /* @__PURE__ */ jsx(
      ProgressPrimitive.Indicator,
      {
        className: "h-full w-full flex-1 bg-primary transition-all",
        style: { transform: `translateX(-${100 - (value || 0)}%)` }
      }
    )
  }
));
Progress.displayName = ProgressPrimitive.Root.displayName;
var alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        destructive: "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
var Alert = React18.forwardRef(({ className, variant, ...props }, ref) => /* @__PURE__ */ jsx(
  "div",
  {
    ref,
    role: "alert",
    className: cn(alertVariants({ variant }), className),
    ...props
  }
));
Alert.displayName = "Alert";
var AlertTitle = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "h5",
  {
    ref,
    className: cn("mb-1 font-medium leading-none tracking-tight", className),
    ...props
  }
));
AlertTitle.displayName = "AlertTitle";
var AlertDescription = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "div",
  {
    ref,
    className: cn("text-sm [&_p]:leading-relaxed", className),
    ...props
  }
));
AlertDescription.displayName = "AlertDescription";
var AlertDialog = AlertDialogPrimitive.Root;
var AlertDialogTrigger = AlertDialogPrimitive.Trigger;
var AlertDialogPortal = AlertDialogPrimitive.Portal;
var AlertDialogOverlay = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  AlertDialogPrimitive.Overlay,
  {
    className: cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    ),
    ...props,
    ref
  }
));
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName;
var AlertDialogContent = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsxs(AlertDialogPortal, { children: [
  /* @__PURE__ */ jsx(AlertDialogOverlay, {}),
  /* @__PURE__ */ jsx(
    AlertDialogPrimitive.Content,
    {
      ref,
      className: cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      ),
      ...props
    }
  )
] }));
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName;
var AlertDialogHeader = ({
  className,
  ...props
}) => /* @__PURE__ */ jsx(
  "div",
  {
    className: cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    ),
    ...props
  }
);
AlertDialogHeader.displayName = "AlertDialogHeader";
var AlertDialogFooter = ({
  className,
  ...props
}) => /* @__PURE__ */ jsx(
  "div",
  {
    className: cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    ),
    ...props
  }
);
AlertDialogFooter.displayName = "AlertDialogFooter";
var AlertDialogTitle = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  AlertDialogPrimitive.Title,
  {
    ref,
    className: cn("text-lg font-semibold", className),
    ...props
  }
));
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName;
var AlertDialogDescription = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  AlertDialogPrimitive.Description,
  {
    ref,
    className: cn("text-sm text-muted-foreground", className),
    ...props
  }
));
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName;
var AlertDialogAction = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  AlertDialogPrimitive.Action,
  {
    ref,
    className: cn(buttonVariants(), className),
    ...props
  }
));
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName;
var AlertDialogCancel = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  AlertDialogPrimitive.Cancel,
  {
    ref,
    className: cn(
      buttonVariants({ variant: "outline" }),
      "mt-2 sm:mt-0",
      className
    ),
    ...props
  }
));
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName;
var Sheet = DialogPrimitive.Root;
var SheetTrigger = DialogPrimitive.Trigger;
var SheetClose = DialogPrimitive.Close;
var SheetPortal = DialogPrimitive.Portal;
var SheetOverlay = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  DialogPrimitive.Overlay,
  {
    className: cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    ),
    ...props,
    ref
  }
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;
var sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom: "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right: "inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm"
      }
    },
    defaultVariants: {
      side: "right"
    }
  }
);
var SheetContent = React18.forwardRef(({ side = "right", className, children, showCloseButton = true, ...props }, ref) => /* @__PURE__ */ jsxs(SheetPortal, { children: [
  /* @__PURE__ */ jsx(SheetOverlay, {}),
  /* @__PURE__ */ jsxs(
    DialogPrimitive.Content,
    {
      ref,
      className: cn(sheetVariants({ side }), className),
      ...props,
      children: [
        children,
        showCloseButton && /* @__PURE__ */ jsxs(DialogPrimitive.Close, { className: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary", children: [
          /* @__PURE__ */ jsx(X, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Close" })
        ] })
      ]
    }
  )
] }));
SheetContent.displayName = DialogPrimitive.Content.displayName;
var SheetHeader = ({
  className,
  ...props
}) => /* @__PURE__ */ jsx(
  "div",
  {
    className: cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    ),
    ...props
  }
);
SheetHeader.displayName = "SheetHeader";
var SheetFooter = ({
  className,
  ...props
}) => /* @__PURE__ */ jsx(
  "div",
  {
    className: cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    ),
    ...props
  }
);
SheetFooter.displayName = "SheetFooter";
var SheetTitle = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  DialogPrimitive.Title,
  {
    ref,
    className: cn("text-lg font-semibold text-foreground", className),
    ...props
  }
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;
var SheetDescription = React18.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  DialogPrimitive.Description,
  {
    ref,
    className: cn("text-sm text-muted-foreground", className),
    ...props
  }
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;
function Skeleton({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: cn("animate-pulse rounded-md bg-muted", className),
      ...props
    }
  );
}
var variantColors = {
  success: { dot: "bg-green-500", ping: "bg-green-400" },
  warning: { dot: "bg-yellow-500", ping: "bg-yellow-400" },
  error: { dot: "bg-red-500", ping: "bg-red-400" },
  info: { dot: "bg-blue-500", ping: "bg-blue-400" },
  neutral: { dot: "bg-muted-foreground", ping: "bg-muted-foreground/60" },
  default: { dot: "bg-muted-foreground", ping: "bg-muted-foreground/60" }
};
var sizeMap = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
  lg: "h-3 w-3"
};
function StatusIndicator({
  variant = "default",
  animated = false,
  size = "md",
  label,
  className
}) {
  const colors = variantColors[variant];
  const dotSize = sizeMap[size];
  return /* @__PURE__ */ jsxs("div", { className: cn("flex items-center gap-2", className), children: [
    /* @__PURE__ */ jsxs("span", { className: cn("relative flex", dotSize), children: [
      animated && /* @__PURE__ */ jsx(
        "span",
        {
          className: cn(
            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
            colors.ping
          )
        }
      ),
      /* @__PURE__ */ jsx(
        "span",
        {
          className: cn(
            "relative inline-flex rounded-full",
            dotSize,
            colors.dot
          )
        }
      )
    ] }),
    label && /* @__PURE__ */ jsx("span", { className: "text-sm", children: label })
  ] });
}
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  confirmPlaceholder,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  onConfirm,
  onCancel
}) {
  const [inputValue, setInputValue] = useState("");
  const needsTextConfirmation = !!confirmText;
  const isConfirmEnabled = needsTextConfirmation ? inputValue === confirmText : true;
  const handleOpenChange = (nextOpen) => {
    if (!nextOpen) {
      setInputValue("");
    }
    onOpenChange(nextOpen);
  };
  const handleConfirm = () => {
    if (!isConfirmEnabled || loading) return;
    onConfirm();
  };
  const handleCancel = () => {
    setInputValue("");
    onCancel?.();
    onOpenChange(false);
  };
  return /* @__PURE__ */ jsx(AlertDialog, { open, onOpenChange: handleOpenChange, children: /* @__PURE__ */ jsxs(AlertDialogContent, { children: [
    /* @__PURE__ */ jsxs(AlertDialogHeader, { children: [
      /* @__PURE__ */ jsx(AlertDialogTitle, { children: title }),
      description && /* @__PURE__ */ jsx(AlertDialogDescription, { children: description })
    ] }),
    needsTextConfirmation && /* @__PURE__ */ jsxs("div", { className: "py-2", children: [
      /* @__PURE__ */ jsxs("p", { className: "text-sm text-muted-foreground mb-2", children: [
        "Type ",
        /* @__PURE__ */ jsx("span", { className: "font-mono font-semibold", children: confirmText }),
        " to confirm:"
      ] }),
      /* @__PURE__ */ jsx(
        Input,
        {
          value: inputValue,
          onChange: (e) => setInputValue(e.target.value),
          placeholder: confirmPlaceholder || confirmText,
          autoFocus: true
        }
      )
    ] }),
    /* @__PURE__ */ jsxs(AlertDialogFooter, { children: [
      /* @__PURE__ */ jsx(AlertDialogCancel, { onClick: handleCancel, disabled: loading, children: cancelLabel }),
      /* @__PURE__ */ jsx(
        AlertDialogAction,
        {
          onClick: handleConfirm,
          disabled: !isConfirmEnabled || loading,
          className: destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : void 0,
          children: loading ? "..." : confirmLabel
        }
      )
    ] })
  ] }) });
}
function NameConfirmDeleteDialog({
  open,
  onOpenChange,
  resourceIdentifier,
  resourceType,
  onConfirm,
  isLoading = false,
  error = null,
  titlePrefix = "\u5220\u9664",
  extraDescription,
  showCascadeOption = false,
  onCascadeChange,
  defaultCascade = false
}) {
  const [confirmText, setConfirmText] = useState("");
  const [cascade, setCascade] = useState(defaultCascade);
  useEffect(() => {
    if (open) {
      setConfirmText("");
      setCascade(defaultCascade);
    }
  }, [open, resourceIdentifier, defaultCascade]);
  const handleCascadeChange = (checked) => {
    setCascade(checked);
    onCascadeChange?.(checked);
  };
  const handleConfirm = async () => {
    if (!resourceIdentifier || confirmText !== resourceIdentifier) return;
    await onConfirm();
  };
  const handleClose = () => {
    if (!isLoading) {
      setConfirmText("");
      onOpenChange(false);
    }
  };
  const isConfirmDisabled = isLoading || !confirmText || confirmText !== resourceIdentifier;
  return /* @__PURE__ */ jsx(AlertDialog, { open, onOpenChange: handleClose, children: /* @__PURE__ */ jsxs(AlertDialogContent, { className: "max-w-md", children: [
    /* @__PURE__ */ jsx(AlertDialogHeader, { children: /* @__PURE__ */ jsxs(AlertDialogTitle, { className: "flex items-center space-x-2", children: [
      /* @__PURE__ */ jsx("div", { className: "h-6 w-6 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0", children: /* @__PURE__ */ jsx("svg", { className: "h-4 w-4 text-destructive", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" }) }) }),
      /* @__PURE__ */ jsxs("span", { children: [
        titlePrefix,
        resourceType
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-4 my-4", children: [
      extraDescription && /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: extraDescription }),
      showCascadeOption && /* @__PURE__ */ jsxs("div", { className: "flex items-start space-x-2 p-3 bg-muted border border-border rounded", children: [
        /* @__PURE__ */ jsx(
          Checkbox,
          {
            id: "cascade-delete",
            checked: cascade,
            onCheckedChange: (checked) => handleCascadeChange(!!checked),
            disabled: isLoading
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
          /* @__PURE__ */ jsx(Label, { htmlFor: "cascade-delete", className: "text-sm font-medium text-foreground cursor-pointer", children: "\u540C\u65F6\u5220\u9664\u5173\u8054\u8D44\u6E90" }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground mt-1", children: "\u52FE\u9009\u6B64\u9879\u5C06\u5220\u9664\u6240\u6709\u5173\u8054\u7684\u9879\u76EE\u3001\u6210\u5458\u7B49\u8D44\u6E90\uFF0C\u4E0D\u52FE\u9009\u5219\u4FDD\u7559\u8FD9\u4E9B\u8D44\u6E90" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxs(Label, { htmlFor: "name-confirm-input", className: "text-sm font-medium text-foreground", children: [
          "\u8BF7\u8F93\u5165",
          resourceType,
          "\u540D\u79F0",
          " ",
          /* @__PURE__ */ jsx("span", { className: "font-mono bg-muted px-2 py-0.5 rounded", children: resourceIdentifier }),
          " ",
          "\u4EE5\u786E\u8BA4\uFF1A"
        ] }),
        /* @__PURE__ */ jsx(
          Input,
          {
            id: "name-confirm-input",
            value: confirmText,
            onChange: (e) => setConfirmText(e.target.value),
            placeholder: `\u8BF7\u8F93\u5165${resourceType}\u540D\u79F0`,
            disabled: isLoading,
            autoFocus: true
          }
        )
      ] }),
      error && /* @__PURE__ */ jsx("div", { className: "text-destructive text-sm bg-destructive/10 border border-destructive/30 rounded p-3", children: error })
    ] }),
    /* @__PURE__ */ jsxs(AlertDialogFooter, { children: [
      /* @__PURE__ */ jsx(AlertDialogCancel, { disabled: isLoading, onClick: handleClose, children: "\u53D6\u6D88" }),
      /* @__PURE__ */ jsx(
        AlertDialogAction,
        {
          onClick: handleConfirm,
          disabled: isConfirmDisabled,
          className: "bg-destructive hover:bg-destructive/90 text-destructive-foreground disabled:opacity-50",
          children: isLoading ? `${titlePrefix}\u4E2D...` : `\u786E\u8BA4${titlePrefix}`
        }
      )
    ] })
  ] }) });
}
function CreateResourceDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  isCreating = false,
  defaultYaml = ""
}) {
  const [yaml, setYaml] = useState(defaultYaml);
  useEffect(() => {
    if (open) {
      setYaml(defaultYaml);
    }
  }, [open, defaultYaml]);
  const handleSubmit = () => {
    if (yaml.trim()) {
      onConfirm(yaml);
    }
  };
  return /* @__PURE__ */ jsx(Dialog, { open, onOpenChange, children: /* @__PURE__ */ jsxs(DialogContent, { className: "max-w-4xl max-h-[80vh] flex flex-col", children: [
    /* @__PURE__ */ jsxs(DialogHeader, { children: [
      /* @__PURE__ */ jsx(DialogTitle, { children: title }),
      /* @__PURE__ */ jsx(DialogDescription, { children: description })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-auto", children: /* @__PURE__ */ jsx(
      Textarea,
      {
        value: yaml,
        onChange: (e) => setYaml(e.target.value),
        placeholder: "\u8BF7\u8F93\u5165 YAML \u914D\u7F6E...",
        className: "min-h-[400px] font-mono text-sm",
        disabled: isCreating
      }
    ) }),
    /* @__PURE__ */ jsxs(DialogFooter, { children: [
      /* @__PURE__ */ jsx(
        Button,
        {
          variant: "outline",
          onClick: () => onOpenChange(false),
          disabled: isCreating,
          children: "\u53D6\u6D88"
        }
      ),
      /* @__PURE__ */ jsx(Button, { onClick: handleSubmit, disabled: isCreating || !yaml.trim(), children: isCreating ? "\u521B\u5EFA\u4E2D..." : "\u521B\u5EFA" })
    ] })
  ] }) });
}
function YamlEditDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  isUpdating = false,
  initialYaml = "",
  showValidation = true,
  readOnly = false
}) {
  const [yaml, setYaml] = useState(initialYaml);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  useEffect(() => {
    if (open) {
      setYaml(initialYaml);
      setError(null);
    }
  }, [open, initialYaml]);
  const validateYaml = (content) => {
    if (!showValidation) return true;
    const trimmed = content.trim();
    if (!trimmed) {
      setError("YAML \u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A");
      return false;
    }
    try {
      load(trimmed);
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "YAML \u683C\u5F0F\u9519\u8BEF");
      return false;
    }
  };
  const handleEditorChange = (value) => {
    const next = value ?? "";
    setYaml(next);
    if (showValidation && next.trim()) {
      validateYaml(next);
    } else {
      setError(null);
    }
  };
  const handleSubmit = async () => {
    if (!yaml.trim()) {
      setError("YAML \u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A");
      return;
    }
    if (showValidation && !validateYaml(yaml)) return;
    if (!onConfirm) return;
    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirm(yaml);
    } catch (err) {
      setError(err instanceof Error ? err.message : "\u4FDD\u5B58\u5931\u8D25");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleCancel = () => {
    setYaml(initialYaml);
    setError(null);
    onOpenChange(false);
  };
  const isProcessing = isUpdating || isSubmitting;
  const hasValidYaml = yaml.trim() && (!showValidation || !error);
  return /* @__PURE__ */ jsx(Dialog, { open, onOpenChange: !isProcessing ? onOpenChange : void 0, children: /* @__PURE__ */ jsxs(DialogPortal, { children: [
    /* @__PURE__ */ jsx(DialogOverlay, { className: "bg-black/80" }),
    /* @__PURE__ */ jsx(DialogContent, { className: "max-w-[calc(100vw-2rem)] w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] h-[calc(100vh-2rem)] p-0 gap-0", children: /* @__PURE__ */ jsxs("div", { className: "h-full flex flex-col", children: [
      /* @__PURE__ */ jsx(
        "div",
        {
          className: "px-6 py-3 border-b border-border flex-shrink-0",
          style: { backgroundColor: "#F9FBFF" },
          children: /* @__PURE__ */ jsxs("div", { className: "flex items-baseline space-x-2", children: [
            /* @__PURE__ */ jsx(FileText, { className: "h-5 w-5 text-muted-foreground flex-shrink-0" }),
            /* @__PURE__ */ jsx(DialogTitle, { className: "text-lg font-medium text-foreground leading-none", children: title }),
            description && /* @__PURE__ */ jsx(DialogDescription, { className: "text-xs text-muted-foreground leading-none", children: description })
          ] })
        }
      ),
      /* @__PURE__ */ jsx(
        "div",
        {
          className: "flex-1 overflow-auto p-4",
          style: { backgroundColor: "#EFF4F9" },
          children: /* @__PURE__ */ jsx("div", { className: "bg-card rounded border border-border h-full flex flex-col", children: /* @__PURE__ */ jsxs("div", { className: "flex-1 p-4 flex flex-col space-y-4", children: [
            /* @__PURE__ */ jsx("div", { className: "flex-1 border border-border rounded overflow-hidden", children: /* @__PURE__ */ jsx(
              Editor,
              {
                height: "100%",
                defaultLanguage: "yaml",
                value: yaml,
                onChange: handleEditorChange,
                theme: "vs-dark",
                loading: /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center h-full text-muted-foreground", children: "\u52A0\u8F7D\u7F16\u8F91\u5668..." }),
                options: {
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  lineNumbers: "on",
                  folding: true,
                  foldingStrategy: "indentation",
                  showFoldingControls: "always",
                  wordWrap: "on",
                  automaticLayout: true,
                  readOnly: readOnly || isProcessing,
                  lineDecorationsWidth: 10,
                  lineNumbersMinChars: 3,
                  renderLineHighlight: "line",
                  scrollbar: {
                    verticalScrollbarSize: 8,
                    horizontalScrollbarSize: 8
                  },
                  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
                }
              }
            ) }),
            error && /* @__PURE__ */ jsxs(Alert, { variant: "destructive", children: [
              /* @__PURE__ */ jsx(AlertCircle, { className: "h-4 w-4" }),
              /* @__PURE__ */ jsx(AlertDescription, { children: error })
            ] })
          ] }) })
        }
      ),
      /* @__PURE__ */ jsx("div", { className: "px-6 py-4 border-t border-border bg-card flex-shrink-0", children: /* @__PURE__ */ jsx(DialogFooter, { className: "flex justify-end gap-3 m-0", children: readOnly ? /* @__PURE__ */ jsx(Button, { variant: "outline", onClick: handleCancel, className: "h-8", children: "\u5173\u95ED" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(
          Button,
          {
            variant: "outline",
            onClick: handleCancel,
            disabled: isProcessing,
            className: "h-8",
            children: "\u53D6\u6D88"
          }
        ),
        /* @__PURE__ */ jsx(
          Button,
          {
            onClick: handleSubmit,
            disabled: isProcessing || !hasValidYaml,
            className: "h-8",
            children: isProcessing ? "\u4FDD\u5B58\u4E2D..." : "\u4FDD\u5B58"
          }
        )
      ] }) }) })
    ] }) })
  ] }) });
}
function ProgressRing({
  value,
  size = 65,
  strokeWidth = 6,
  color = "#52c41a",
  trackColor = "#e5e7eb",
  children,
  className
}) {
  const clampedValue = Math.min(Math.max(value, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = `${clampedValue / 100 * circumference} ${circumference}`;
  return /* @__PURE__ */ jsxs("div", { className: cn("relative inline-flex", className), children: [
    /* @__PURE__ */ jsxs("svg", { width: size, height: size, className: "transform -rotate-90", children: [
      /* @__PURE__ */ jsx(
        "circle",
        {
          cx: center,
          cy: center,
          r: radius,
          stroke: trackColor,
          strokeWidth,
          fill: "transparent"
        }
      ),
      /* @__PURE__ */ jsx(
        "circle",
        {
          cx: center,
          cy: center,
          r: radius,
          stroke: color,
          strokeWidth,
          fill: "transparent",
          strokeDasharray,
          strokeLinecap: "round",
          className: "transition-all duration-300 ease-in-out"
        }
      )
    ] }),
    children && /* @__PURE__ */ jsx("div", { className: "absolute inset-0 flex items-center justify-center", children })
  ] });
}
function CollapsibleSection({
  title,
  icon,
  extra,
  defaultExpanded = true,
  expanded: controlledExpanded,
  onToggle,
  children,
  className,
  contentClassName
}) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = controlledExpanded !== void 0;
  const isExpanded = isControlled ? controlledExpanded : internalExpanded;
  const handleToggle = () => {
    const next = !isExpanded;
    if (!isControlled) {
      setInternalExpanded(next);
    }
    onToggle?.(next);
  };
  return /* @__PURE__ */ jsxs("div", { className: cn("border border-border rounded-lg", className), children: [
    /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        onClick: handleToggle,
        className: cn(
          "w-full px-4 py-3 flex items-center justify-between",
          "hover:bg-accent/50 transition-colors",
          "text-left"
        ),
        children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            icon,
            /* @__PURE__ */ jsx("span", { className: "text-sm font-medium", children: title }),
            extra
          ] }),
          /* @__PURE__ */ jsx(
            ChevronDown,
            {
              className: cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                isExpanded && "rotate-180"
              )
            }
          )
        ]
      }
    ),
    isExpanded && /* @__PURE__ */ jsx("div", { className: cn("px-4 pb-4", contentClassName), children })
  ] });
}
var Popover = PopoverPrimitive.Root;
var PopoverTrigger = PopoverPrimitive.Trigger;
var PopoverAnchor = PopoverPrimitive.Anchor;
var PopoverContent = React18.forwardRef(({ className, align = "center", sideOffset = 4, ...props }, ref) => /* @__PURE__ */ jsx(PopoverPrimitive.Portal, { children: /* @__PURE__ */ jsx(
  PopoverPrimitive.Content,
  {
    ref,
    align,
    sideOffset,
    className: cn(
      "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    ),
    ...props
  }
) }));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
var ChartContainer = React18.forwardRef(({ config, children, className, ...props }, ref) => {
  const id = React18.useId();
  return /* @__PURE__ */ jsxs(
    "div",
    {
      "data-chart": id,
      ref,
      className: cn(
        "w-full h-[200px] [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
        className
      ),
      ...props,
      children: [
        /* @__PURE__ */ jsx(
          "style",
          {
            dangerouslySetInnerHTML: {
              __html: Object.entries(config).filter(([_, config2]) => config2.theme || config2.color).map(([key, itemConfig]) => {
                const color = itemConfig.theme?.light ?? itemConfig.color;
                return color ? `[data-chart=${id}] .color-${key} { color: ${color}; }` : null;
              }).join("")
            }
          }
        ),
        children
      ]
    }
  );
});
ChartContainer.displayName = "ChartContainer";
var ChartTooltip = ({ children }) => {
  return /* @__PURE__ */ jsx(Fragment, { children });
};
var ChartTooltipContent = React18.forwardRef(
  ({
    active,
    payload,
    label,
    indicator = "dot",
    hideLabel = false,
    hideIndicator = false,
    labelFormatter,
    labelClassName,
    formatter,
    color,
    nameKey,
    labelKey,
    className,
    ...props
  }, ref) => {
    if (!active || !payload?.length) {
      return null;
    }
    return /* @__PURE__ */ jsxs(
      "div",
      {
        ref,
        className: cn(
          "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
          className
        ),
        ...props,
        children: [
          !hideLabel && /* @__PURE__ */ jsx("div", { className: cn("font-medium", labelClassName), children: labelFormatter ? labelFormatter(label, payload) : label }),
          /* @__PURE__ */ jsx("div", { className: "grid gap-1.5", children: payload.map((item, index) => /* @__PURE__ */ jsxs(
            "div",
            {
              className: "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
              children: [
                !hideIndicator && /* @__PURE__ */ jsx(
                  "div",
                  {
                    className: "shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]",
                    style: {
                      "--color-bg": item.color,
                      "--color-border": item.color,
                      width: indicator === "dot" ? "0.5rem" : "0.75rem",
                      height: indicator === "dot" ? "0.5rem" : "0.25rem"
                    }
                  }
                ),
                /* @__PURE__ */ jsxs("div", { className: "flex flex-1 justify-between leading-none", children: [
                  /* @__PURE__ */ jsx("div", { className: "grid gap-1.5", children: /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: nameKey ? item.payload[nameKey] : item.name }) }),
                  /* @__PURE__ */ jsx("span", { className: "font-mono font-medium tabular-nums text-foreground", children: formatter ? formatter(item.value, item.name, item) : item.value })
                ] })
              ]
            },
            index
          )) })
        ]
      }
    );
  }
);
ChartTooltipContent.displayName = "ChartTooltipContent";
function KPICard({
  icon: Icon2,
  title,
  value,
  unit,
  trend,
  iconBgColor = "bg-primary/10",
  iconColor = "text-primary",
  className
}) {
  return /* @__PURE__ */ jsxs("div", { className: cn("bg-card border border-border rounded p-4", className), children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-3", children: [
      /* @__PURE__ */ jsx("div", { className: cn("p-2 rounded", iconBgColor), children: /* @__PURE__ */ jsx(Icon2, { className: cn("h-5 w-5", iconColor) }) }),
      trend && /* @__PURE__ */ jsxs(
        "div",
        {
          className: cn(
            "text-xs font-medium",
            trend.isPositive ? "text-green-600 dark:text-green-400" : "text-destructive"
          ),
          children: [
            trend.isPositive ? "\u2191" : "\u2193",
            " ",
            Math.abs(trend.value),
            "%"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mb-1", children: [
      /* @__PURE__ */ jsx("span", { className: "text-2xl font-semibold text-foreground", children: value }),
      unit && /* @__PURE__ */ jsx("span", { className: "text-sm text-muted-foreground ml-1", children: unit })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "text-sm text-muted-foreground", children: title })
  ] });
}
function ResourceChart({
  title,
  currentValue,
  percentage,
  timeSeries,
  color = "#3b82f6",
  unit = "%",
  showGrid = true,
  className
}) {
  const chartConfig = {
    value: {
      label: title,
      color
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: cn("bg-card border border-border rounded p-4", className), children: [
    /* @__PURE__ */ jsxs("div", { className: "mb-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-2", children: [
        /* @__PURE__ */ jsx("h3", { className: "text-sm font-medium text-foreground", children: title }),
        /* @__PURE__ */ jsxs("div", { className: "text-right", children: [
          /* @__PURE__ */ jsxs("span", { className: "text-2xl font-semibold text-foreground", children: [
            percentage.toFixed(1),
            unit
          ] }),
          /* @__PURE__ */ jsx("div", { className: "text-xs text-muted-foreground mt-1", children: currentValue })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "w-full bg-muted rounded-full h-2", children: /* @__PURE__ */ jsx(
        "div",
        {
          className: cn(
            "h-2 rounded-full transition-all duration-300",
            percentage > 80 ? "bg-destructive" : percentage > 60 ? "bg-yellow-500 dark:bg-yellow-400" : "bg-primary"
          ),
          style: { width: `${Math.min(percentage, 100)}%` }
        }
      ) })
    ] }),
    /* @__PURE__ */ jsx(ChartContainer, { config: chartConfig, className: "h-[200px] w-full", children: /* @__PURE__ */ jsx(ResponsiveContainer, { width: "100%", height: "100%", children: /* @__PURE__ */ jsxs(
      AreaChart,
      {
        data: timeSeries,
        margin: { top: 10, right: 10, left: -20, bottom: 0 },
        children: [
          showGrid && /* @__PURE__ */ jsx(
            CartesianGrid,
            {
              strokeDasharray: "3 3",
              stroke: "#e5e7eb",
              vertical: false
            }
          ),
          /* @__PURE__ */ jsx(
            XAxis,
            {
              dataKey: "time",
              tick: { fontSize: 12, fill: "#6b7280" },
              tickLine: false,
              axisLine: { stroke: "#e5e7eb" }
            }
          ),
          /* @__PURE__ */ jsx(
            YAxis,
            {
              tick: { fontSize: 12, fill: "#6b7280" },
              tickLine: false,
              axisLine: { stroke: "#e5e7eb" },
              tickFormatter: (v) => `${v}${unit}`
            }
          ),
          /* @__PURE__ */ jsx(ChartTooltip, { children: /* @__PURE__ */ jsx(
            ChartTooltipContent,
            {
              formatter: (value) => `${Number(value).toFixed(2)}${unit}`
            }
          ) }),
          /* @__PURE__ */ jsx(
            Area,
            {
              type: "monotone",
              dataKey: "value",
              stroke: color,
              fill: color,
              fillOpacity: 0.2,
              strokeWidth: 2
            }
          )
        ]
      }
    ) }) })
  ] });
}

export { Alert, AlertDescription, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, AlertDialogPortal, AlertDialogTitle, AlertDialogTrigger, AlertTitle, Avatar, AvatarFallback, AvatarImage, Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, ChartContainer, ChartTooltip, ChartTooltipContent, Checkbox, Collapsible, CollapsibleContent2 as CollapsibleContent, CollapsibleSection, CollapsibleTrigger2 as CollapsibleTrigger, ConfirmDeleteDialog, ConfirmDialog, CreateResourceDialog, DataTable, DateRangePicker, Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, EmptyState, Form, FormControl, FormDescription, FormField, FormLabel, FormMessage, Input, KPICard, Label, LabelEditor, Loading, LoadingOverlay, NameConfirmDeleteDialog, NumberField, PageHeader, Pagination, Popover, PopoverAnchor, PopoverContent, PopoverTrigger, Progress, ProgressRing, PropertyList, RadioGroup, RadioGroupItem, ResourceChart, ScrollArea, ScrollBar, SearchableSelect, Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger, SelectValue, Separator, Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetOverlay, SheetPortal, SheetTitle, SheetTrigger, Skeleton, Spinner, StatusIndicator, Switch, Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, Toggle, ToggleGroup, ToggleGroupItem, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, YamlEditDialog, badgeVariants, buttonVariants, cn, toggleVariants };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map