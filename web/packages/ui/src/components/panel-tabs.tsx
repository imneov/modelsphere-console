"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";

import { cn } from "../utils";
import { SCROLL_SHADOW_CLS } from "../hooks/use-scroll-shadow";

// PanelTabs —— 切换下面那片内容是哪个面板。详情页的「概览 / 实例 / 日志」是典型用法。
//
// **和 `PageTabs` 不是一回事，别混。** `PageTabs` 切的是**操作对象**（平台服务 /
// 项目服务）：切完列会变、新建按钮的语义会变、空态会变。本组件切的是**同一个对象的
// 哪一面**，对象自始至终是那一个。判据在 PATTERNS 1.4，机械可判。
//
// ══════════════════════════════════════════════════════════════════════════════
// ── 为什么不继续把 Tab 塞进 DetailHeader ────────────────────────────────────
// 塞进页头卡时它是一排挤在左边的胶囊，**读起来像一组筛选开关**：胶囊本身是个
// 独立控件的形状，四周被卡片包着，和下面的内容区之间还隔着卡片的下边框与一段
// 留白 —— 没有任何一处在说「按这里换的是下面那一片」。
//
// 这一版把三件事同时改掉：
//
//   1. **通栏**：Tab 条与内容区**同宽同左边界**，一眼看出它管的是下面整片，
//      而不是页头里的一个小控件。
//   2. **落在内容区上沿**：条自己带一条贯穿的下边框，Tab 条 → 边框 → 内容，
//      顺序就是「标题 → 分界 → 正文」。
//   3. **选中项朝下指**：指示条压在那条边框上（或直接跨过它连到下面），
//      指向它所支配的区域。
//
// ── 为什么是「吸顶」，不是「内容区自己滚」 ────────────────────────────────
// 整页滚时这条带会被滚走：切个 Tab 得先滚回顶部，而「它管的是下面那片」这层关系
// 也只在滚到顶时才成立 —— 正是上面那条要解决的问题，滚一下又回来了。
//
// 但**不要**因此把滚动轴挪进内容区。详情页头有一百八九十像素高，真做成内层滚它就得
// 常驻；更贵的是嵌套滚动容器那串隐性成本：⌘F 页内查找滚错容器、浏览器滚动位置恢复
// 失效、锚点跳转要自己接管、高度算错一点底部就被切掉（PATTERNS 把「第二条滚动轴」
// 当经典 bug 写，就是这个原因）。内容短的 Tab 还会留一块定高空白。
//
// 所以：**滚动轴仍然只有一条、还在页面上，这条带 `sticky` 粘在顶部。**
// 页头照常滚走（身份信息看一眼就够），导航常驻。两边的好处都拿到，代价一个不付。
//
// 粘住时补一道投影，表示内容是从这条带下面穿过去的。抽屉那条 chrome 带的值不能照抄：
// 那边带和内容都是白的，极淡的一道就够；这里带和内容都是画布灰，同样的值会糊掉。
// 所以收紧扩散、提高不透明度 —— 仍然是**单层**投影（多重阴影是禁令）。
//
// ── 血缘：组合 ──────────────────────────────────────────────────────────────
// 行为（选中态、键盘方向键、roving tabindex、ARIA、panel 关联）全部来自 Base UI
// 的 Tabs 原语，本文件只做皮肤。滑块也是原语给的：`Tabs.Indicator` 会把当前
// 选中项的位置尺寸写成 `--active-tab-left / --active-tab-width` 两个 CSS 变量，
// 我们只是把一个绝对定位的条贴上去 —— **不自己测量 DOM**，那是会在字体加载、
// 容器缩放、密度切换时对不齐的一类活。
//
// ── 用法 ────────────────────────────────────────────────────────────────────
// 必须放在 `<Tabs>` 里（和 `TabsContent` 同一个 root），放在 `DetailHeader`
// **下面**，不要再走 header 的 `tabs` 插槽：
//
//   <Tabs value={tab} onValueChange={setTab}>
//     <DetailHeader … />          {/* 不传 tabs */}
//     <PanelTabs items={ITEMS} />
//     <TabsContent value="overview">…</TabsContent>
//   </Tabs>
//
// ── 五档形态，默认「极简」（LF 定案）────────────────────────────────────────
// 五档都保留，默认是 `ghost`（极简）：没有容器也没有分界线，只有文字与一段圆头滑块。
// 调用方通常只传 `items`，拿到的就是默认档；要别的档再传 `variant`。
//
// 极简这一档**没有那条分界线** —— 上面第 2 条说的「条自己带一条贯穿的下边框」在这档
// 不成立，靠的是选中项的主色文字 + 滑块，以及它与内容之间的留白。要那条线就用
// `underline`。
//
// ── 不放图标 ────────────────────────────────────────────────────────────────
// Tab 一律纯文字（PATTERNS 9.5）。`count` 是数据不是装饰，给了就显示。

export type PanelTabsVariant =
  /** 下划线：选中项主色文字 + 一条主色滑块**压在**通栏分界线上，两者合成一条 */
  | "underline"
  /** 分离式下划线：滑块贴着文字，分界线单独落在下面一层，中间留空 */
  | "line"
  /** 连体纸张：选中项是一张翻起来的卡，底边把分界线擦掉，与下面连成一片 */
  | "sheet"
  /** 主色胶囊：选中项是一颗主色浅底的圆胶囊，底色滑着走 */
  | "pill"
  /** 实心：选中项是一块实心主色，整条装在一个卡壳里 */
  | "solid"
  /** 极简：没有容器也没有分界线，只有文字与一段圆头滑块 */
  | "ghost";

export interface PanelTabsItem {
  /** 与 `TabsContent` 的 `value` 对应 */
  value: string;
  /** 纯文字，别放图标 */
  label: string;
  /** 有数量就给，没有就不给。渲染成一个次要色的数字，不是 Badge */
  count?: number;
  disabled?: boolean;
}

/**
 * 这条带的**壳**。与 `variant`（页签本身长什么样）是两件事。
 *
 * `auto`（默认）跟「页签风格」偏好走，和 `PageTabs` 同一个开关
 * （`<html data-page-tabs-style>`）—— 两者是同一套壳语言，页面才不会一处贴边、
 * 一处浮起。纯 CSS 响应，不读 store、SSR 不闪。
 *
 * - `flush`（贴边）：没有容器，靠一条通栏分界线和下面的内容分开。
 * - `card`（浮起）：和周围内容卡同一套壳（圆角 + 描边 + 白底），**不画分界线** ——
 *   卡自己的边框已经是边界，再来一条就是双层。
 *
 * 浮起类布局下必须有 `card` 这一档：那些布局里每一块都是圆角浮起的白卡，中间夹一条
 * 没有容器的文字 + 横线，看着就是没做完。
 */
export type PanelTabsShell = "auto" | "flush" | "card"

export interface PanelTabsProps {
  items: PanelTabsItem[];
  /** 页签本身长什么样，默认 `ghost`（极简） */
  variant?: PanelTabsVariant
  /** 这条带的壳，默认 `auto`（跟「页签风格」偏好走） */
  shell?: PanelTabsShell;
  className?: string;
}

/**
 * 通栏分界线：条与内容区之间那一道，2px。

 * 粗细的上限由「分界线」定，不由「滑块想多粗」定 —— 一条贯穿整宽的线到 4px
 * 就不再读成分界，读成一个色块。滑块要更醒目就调颜色，不是继续加厚。
 *
 * **厚度必须和滑块一致**（都是 `h-0.5`）：两者同底边，一样粗时读成「一条线，其中
 * 一段是主色」；不一样粗时，细的那截看着比粗的那截矮一层，像两条没对齐的线。
 *
 * `ghost` 不要它；`sheet` 的选中项会用一条同厚的卡色底边把它擦掉。
 */
const RULE =
  "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-border";

/**
 * 浮起壳：和内容卡同一套外观。`after:hidden` 去掉那条通栏分界线 —— 卡自己的边框
 * 已经是边界，再来一条就是双层。`top-2` 而不是 `top-0`：粘住时给圆角卡和视口上沿
 * 留一口气，否则卡直接顶死在边上。
 *
 * 类名写**完整字面量**，不拼模板串 —— Tailwind 静态扫描看不见拼出来的类。
 */
const SHELL_CARD =
  "rounded-lg border border-border bg-card px-3 py-1.5 top-2 [&_[data-slot=panel-tabs]]:after:hidden";

/** 跟「页签风格」偏好走：默认贴边，切到「经典」时变成浮起卡 */
const SHELL_AUTO =
  " [[data-page-tabs-style=classic]_&]:rounded-lg" +
  " [[data-page-tabs-style=classic]_&]:border" +
  " [[data-page-tabs-style=classic]_&]:border-border" +
  " [[data-page-tabs-style=classic]_&]:bg-card" +
  " [[data-page-tabs-style=classic]_&]:px-3" +
  " [[data-page-tabs-style=classic]_&]:py-1.5" +
  " [[data-page-tabs-style=classic]_&]:top-2" +
  " [[data-page-tabs-style=classic]_&]:[&_[data-slot=panel-tabs]]:after:hidden";

const LIST: Record<PanelTabsVariant, string> = {
  underline: cn("relative w-full gap-6 px-0.5", RULE),
  // `pb-2.5` 撑出滑块与分界线之间那段空隙 —— 这一档的特征就是两者**不合并**
  line: cn("relative w-full gap-6 px-0.5 pb-2.5", RULE),
  sheet: cn("relative w-full items-end gap-1 px-0.5", RULE),
  pill: cn("relative w-full gap-1 px-0.5 pb-2.5", RULE),
  solid: "relative w-full gap-1 rounded-lg border border-border bg-card p-1.5",
  ghost: "relative w-full gap-6 px-0.5",
};

/**
 * 未选中一律 `text-muted-foreground`，**hover 走主色** —— 悬停是「你要去的地方」的
 * 预告，用主色预告最省解释。选中态的样式一律写成 `data-active:`，hover 一律加
 * `not-data-active:` 前缀：两者同为一级变体、特异度相同，不隔开的话 CSS 里谁在后面
 * 谁赢，表现就是「鼠标移到选中项上，选中态被 hover 的灰底盖掉」。
 */
const TAB: Record<PanelTabsVariant, string> = {
  underline: cn(
    "rounded-sm px-0.5 py-2.5 text-muted-foreground",
    "not-data-active:hover:text-primary",
    "data-active:font-medium data-active:text-primary",
  ),
  line: cn(
    "rounded-sm px-0.5 pt-2.5 pb-2 text-muted-foreground",
    "not-data-active:hover:text-primary",
    "data-active:font-medium data-active:text-primary",
  ),
  // 翻起来的一张卡：上圆角 + 描边；底边 2px 卡色，正好盖住 2px 的分界线
  sheet: cn(
    "-mb-0.5 rounded-t-lg rounded-b-none border border-b-2 border-transparent px-3.5 py-2.5 text-muted-foreground",
    "not-data-active:hover:text-primary",
    "data-active:border-border data-active:border-b-card data-active:bg-card",
    "data-active:font-medium data-active:text-primary",
  ),
  // 圆胶囊，底色由滑块给（见 INDICATOR），本体只管文字
  pill: cn(
    "rounded-full px-3.5 py-1.5 text-muted-foreground",
    "not-data-active:hover:text-primary",
    "data-active:font-medium data-active:text-primary",
  ),
  // 实心块同样由滑块给，本体只管文字 —— 块自己带背景的话切换时是"跳"过去的
  solid: cn(
    "rounded-md px-3 py-1.5 text-muted-foreground",
    "not-data-active:hover:text-primary",
    "data-active:font-medium data-active:text-primary-foreground",
  ),
  ghost: cn(
    "rounded-sm px-0.5 py-2 text-muted-foreground",
    "not-data-active:hover:text-primary",
    "data-active:font-medium data-active:text-primary",
  ),
};

/**
 * 指示器（滑块）。位置尺寸来自原语写的四个 CSS 变量，这里只决定它长什么样。
 *
 * **选中项的底色一律交给它，不写在 Tab 上** —— 写在 Tab 上时切换是瞬间换块，
 * 交给滑块才是一块底色从上一项滑到下一项。`sheet` 例外：那一档的选中态是
 * 一张有描边的卡，滑动会把描边一起拖走，反而假。
 */
const INDICATOR: Record<PanelTabsVariant, string | null> = {
  underline: "bottom-0 h-0.5 rounded-full bg-primary",
  // `bottom-2.5` 正好等于 List 的 pb-2.5：滑块落在**格子的下沿**，不是容器下沿，
  // 于是它贴着文字，分界线仍在最底下 —— 中间那段空隙就是这一档和 underline 的区别
  line: "bottom-2.5 h-0.5 rounded-full bg-primary",
  sheet: null,
  pill: "top-[var(--active-tab-top)] h-[var(--active-tab-height)] rounded-full bg-primary/10",
  solid:
    "top-[var(--active-tab-top)] h-[var(--active-tab-height)] rounded-md bg-primary",
  ghost: "bottom-0 h-0.5 rounded-full bg-primary",
};

/**
 * 这条带有没有粘住。用于补投影 —— 纯外观，拿不到也不影响功能。
 *
 * 不用 `IntersectionObserver` 的 `threshold:[1]` 那个经典写法：它要求 root 是真正的
 * 滚动容器，而我们的滚动层是页面里的一个 div 不是视口，还得先把它找出来 ——
 * 既然都要找，直接听那个容器的 scroll 更直白。比较的是两者的 `top`，不是 `scrollTop`，
 * 因为这条带上面还有页头，粘住的时机不是「滚了多少」而是「顶到了没有」。
 */
function useStuck(ref: React.RefObject<HTMLElement | null>) {
  const [stuck, setStuck] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let scroller: HTMLElement | null = el.parentElement;
    while (
      scroller &&
      !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)
    ) {
      scroller = scroller.parentElement;
    }

    const check = () => {
      const top = scroller ? scroller.getBoundingClientRect().top : 0;
      // setState 传同值时 React 自己会 bail out，不用再手动去重
      setStuck(el.getBoundingClientRect().top <= top + 0.5);
    };
    check();

    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      target.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [ref]);

  return stuck;
}

export function PanelTabs({
  items,
  variant = "ghost",
  shell = "auto",
  className,
}: PanelTabsProps) {
  const indicator = INDICATOR[variant];
  const ref = React.useRef<HTMLDivElement>(null);
  const stuck = useStuck(ref);

  return (
    <div
      ref={ref}
      data-slot="panel-tabs-sticky"
      className={cn(
        // 底色必须不透明：内容是从这条带**下面**滚过去的
        "sticky top-0 z-20 bg-surface-page transition-shadow duration-200",
        shell === "card" && SHELL_CARD,
        shell === "auto" && SHELL_AUTO,
        stuck && SCROLL_SHADOW_CLS,
      )}
    >
      <TabsPrimitive.List
        data-slot="panel-tabs"
        data-variant={variant}
        className={cn(
          // 通栏、可横向滚（窄屏 tab 多时不换行、不压缩），滚动条不显形
          "relative flex shrink-0 items-center overflow-x-auto text-sm",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          LIST[variant],
          className,
        )}
      >
        {items.map((it) => (
          <TabsPrimitive.Tab
            key={it.value}
            value={it.value}
            disabled={it.disabled}
            className={cn(
              "group relative z-10 inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap",
              "transition-colors duration-150 outline-none",
              "focus-visible:ring-[3px] focus-visible:ring-ring/50",
              "disabled:pointer-events-none disabled:opacity-50",
              TAB[variant],
            )}
          >
            {it.label}
            {it.count !== undefined && (
              <span
                className={cn(
                  "text-xs tabular-nums text-muted-foreground/70",
                  variant === "solid"
                    ? "group-data-active:text-primary-foreground/70"
                    : "group-data-active:text-primary/60",
                )}
              >
                {it.count}
              </span>
            )}
          </TabsPrimitive.Tab>
        ))}

        {indicator && (
          <TabsPrimitive.Indicator
            renderBeforeHydration
            className={cn(
              // z-[1]：分界线是 List 的 ::after，绘制顺序排在所有子节点之后 ——
            // 滑块留在 z-0 会被那条灰线整条盖住（两者一样厚时表现为「蓝线消失」，
            // 蓝线更厚时表现为「只露出上半截、像两条没对齐的线」）。
            // 仍然低于 Tab 的 z-10：实心 / 胶囊两档的底色要压在文字下面。
            "absolute z-[1] left-[var(--active-tab-left)] w-[var(--active-tab-width)]",
              "transition-[left,width,top,height] duration-300 ease-out",
              indicator,
            )}
          />
        )}
      </TabsPrimitive.List>
    </div>
  );
}
