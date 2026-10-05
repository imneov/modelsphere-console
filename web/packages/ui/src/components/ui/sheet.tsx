"use client"

// ⚠️ 本地改动（相对 shadcn 官方 base-nova）
// ─────────────────────────────────────────────────────────────────────────────
// 除下面这几处，本文件与官方注册表逐字节一致
// （`https://ui.shadcn.com/r/styles/base-nova/sheet.json`，可用 shadcn-diff 脚本对账）：
//
// 1. **新增 `size` 宽度档位**（见 SHEET_SIZE）。官方只有一个写死的
//    `sm:max-w-sm`（384px），调用方要加宽得自己去对抗它 ——
//    这个坑在本仓造出了 6 个调用点 6 种宽度写法。
// 2. **新增 `SheetBody`**。官方 `SheetContent` 没有滚动区，长表单直接溢出视口，
//    于是每个调用点自己补 `overflow-y-auto` 或 `p-0` + 内层滚动。
// 3. **dev 模式警告**两条，见 SheetContent：className 里写死宽度；
//    多槽位却没中和基类的 `gap-4`。
// 5. **把基类里的宽度全部挪进了 `auto` 档**（`data-[side=*]:w-3/4` 和
//    `data-[side=*]:sm:max-w-sm` 两条）。
//
//    留在基类上时它们会**压过所有档位**：那两条规则的选择器带属性选择器
//    （`.data-\[side=right\]\:w-3\/4[data-side=right]`，特异度 0,2,0），
//    而档位类只是普通类（0,1,0）—— 特异度更高的赢，`sm:max-w-none` 这种
//    "解除"写法根本盖不住。
//
//    症状极隐蔽，分两次才暴露干净：
//      · 先是 `sm`/`md`/`full` 被静默夹到 384px，而 `lg`/`2xl` 看着正常 ——
//        因为后两者带 `min-w-*`，**CSS 里 min-width 压过 max-width**，绕过去了。
//      · 摘掉 max-width 之后，压在下面的 `w-3/4` 又冒出来，`md` 从 384 变成 75%。
//
//    所以规则是：**基类不留任何宽度**，宽度只由档位给。官方那套默认值原样保存在
//    `auto` 档里，需要时显式选它。
// 6. **`SheetHeader` 加了 `pr-12`**，给绝对定位的关闭按钮留位 —— 官方没留，
//    header 右侧放任何东西都会被 X 压住。
// 4. `SheetTitle` 少了官方的 `cn-font-heading`（base-nova 的标题字体 utility，
//    我们没有这一层字体分级，跟不了）。
// 7. **关闭守卫**：官方四个出口都直接关。本仓**必须表态是哪一类** —— 表单类传 `dirty`
//    （按「改过没有」决定直接关还是先弹确认框），其它类传 `dismissible`（直接关）。
//    同时新增 `SheetCancelButton`（footer 的取消要走同一个闸门）与 `useSheetClose`。
//    这是全局硬规范，PATTERNS 4.8 有条目。
// 8. 未保存拦截与 `SheetCancelButton` 的默认文案取自 ui 词表（国际化），不是 shadcn 原件内容。
//
// 别把这些"修回"官方——它们是有意的，理由见 `design/PATTERNS.md` 第 4 节。

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

import { cn } from "../../utils"
import { Button } from "./button"
import { ConfirmDialog } from "../confirm-dialog"
import { XIcon } from "lucide-react"
import { useUiT } from "../../i18n/index"

/**
 * 抽屉。
 *
 * ⚠️ **默认（`dismissible` 不传）：关闭路径只有两条 —— 右上角的 X、footer 的「取消」。**
 * 点遮罩、按 Esc 都不关。这一档给**新建 / 创建 / 编辑 / 修改类**抽屉：里面装的是填到
 * 一半的表单，误点空白、随手按 Esc 就整份丢掉，没有确认、没有撤销 —— 代价与「点了取消」
 * 一样，但用户并没有表达要放弃。所以表单类传 `dirty`：**没改过四个出口都直接关**
 * （没改就不该拦，拦了是给用户添堵），改过了四个出口都先问一句。
 *
 * **`dismissible`：其它类抽屉**（只读查看、对比、日志、选择器这类，关掉不丢任何东西）
 * 显式传它，Esc 与点遮罩都放开（LF 2026-09-07 定；见 `design/PATTERNS.md` 4.8）。
 *
 * **两者必须二选一，没有默认。** 曾经「什么都不传」= 拦掉 Esc / 点遮罩并提示，那是
 * 迁移期给存量抽屉留的档（freeland#311 / #327，2026-09-11 全部迁完后删）。留着的代价是
 * 漏传会**静默**退回那套行为、看起来「也能用」，没人会发现它其实没接守卫；现在漏传在
 * console 侧是编译错误，插件侧由 verify-page 的 `sheet-missing-guard` 拦。
 *
 * 此前的例外口子 `disablePointerDismissal={false}` 只放开点遮罩、Esc 仍被拦（onOpenChange
 * 里无条件 cancel），等于坏的；现在统一走 `dismissible`，那个 prop 显式传 false 时视同 dismissible。
 */
/* ------------------------------------------------------------------ */
/* 关闭守卫                                                             */
/* ------------------------------------------------------------------ */

/**
 * 四个出口一个闸门。
 *
 * Esc / 点遮罩 / 焦点移出走 Base UI 的 `onOpenChange`，右上角 X 也走它；**但 footer 的
 * 「取消」是页面自己的按钮**，它直接调页面的 setState，根本不经过 Base UI。不把它接到
 * 同一个闸门上，就会出现「Esc 问一句、取消直接关」两套语义 —— 那比不做守卫更糟。
 *
 * 所以 `Sheet` 往下给一个 `requestClose()`，页面的取消按钮改调它。
 */
interface SheetCloseGate {
  requestClose: () => void
  /** 当前是否有未保存的改动。给调用方做别的判断用（很少需要） */
  dirty: boolean
}

const SheetGateContext = React.createContext<SheetCloseGate | null>(null)

/**
 * 拿这个抽屉的关闭闸门。**footer 的「取消」一律调 `requestClose()`**，
 * 不要直接 `onOpenChange(false)` —— 那样会绕过脏检查。
 */
export function useSheetClose(): SheetCloseGate {
  const ctx = React.useContext(SheetGateContext)
  if (!ctx) {
    // 不抛错（免得一处误用炸掉整页），但**必须喊出来** —— 静默退化成一个
    // 「点了没反应」的取消按钮，是最难查的那种失败：看不出错，只是关不掉。
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[Sheet] useSheetClose / SheetCancelButton 用在了 <Sheet> 外面，拿不到关闭闸门 —— " +
          "这个按钮点了不会有任何反应。把它挪进 <Sheet> 里面（通常是 SheetFooter）。",
      )
    }
    return { requestClose: () => undefined, dirty: false }
  }
  return ctx
}

/**
 * 抽屉**必须显式表态**是哪一类（PATTERNS 4.8）—— 二选一，类型上互斥：
 *
 * | 传什么 | 哪一类 | 行为 |
 * |---|---|---|
 * | `dirty`（`useDirty` 算） | 表单类 | `false` 四个出口直接关；`true` 先问「有修改，确认关闭吗」 |
 * | `dismissible` | 其它类（只读查看 / 对比 / 日志 / 选择器 / 确认） | 四个出口直接关 |
 *
 * 什么都不传在 console 侧是编译错误；插件仓 CI 不跑 tsc，由 verify-page 的
 * `sheet-missing-guard` 规则拦。运行时再补一句 dev 警告兜底。
 *
 */
type SheetGuardProps =
  | {
      /** 表单有没有被改过（`useDirty` 算）。`false` 直接关，`true` 先问一句。 */
      dirty: boolean
      dismissible?: never
      /**
       * 用户选了「放弃修改并关闭」之后。**在这里把表单重置回打开时的样子**
       * （`useDirty` 的基线就是那份）—— 组件够不着页面的 state，
       * 不重置的话下次打开还带着上次放弃掉的输入。
       */
      onDiscard?: () => void
    }
  | {
      /** 非表单类抽屉：Esc 与点遮罩可关，关掉不丢任何东西。 */
      dismissible: true
      dirty?: never
      onDiscard?: never
    }

function Sheet({
  onOpenChange,
  dismissible,
  disablePointerDismissal,
  dirty,
  onDiscard,
  ...props
}: SheetPrimitive.Root.Props & SheetGuardProps) {
  const t = useUiT()
  const canDismiss = !!dismissible || disablePointerDismissal === false
  const guarded = dirty !== undefined
  // 什么都没传：类型拦不住的地方（插件仓无 tsc）在 dev 里喊一声。行为上仍走旧分支 ——
  // 默认成「随手关」会静默丢数据，默认成「必问」会每次关都弹窗，两个都比喊一声糟。
  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    if (guarded || dismissible) return
    console.warn("[Sheet] 抽屉没表态是哪一类：表单类传 dirty、其它类传 dismissible（PATTERNS 4.8）。现在按旧行为走（Esc / 遮罩被拦）。")
  }, [guarded, dismissible])
  const [confirming, setConfirming] = React.useState(false)
  // onOpenChange 走 ref：确认框的回调里要用它，但它不该让 requestClose 每次渲染都换身份
  const onOpenChangeRef = React.useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange

  /**
   * 被确认框拦下的那次关闭的 `details`。确认之后**原样重放**给调用方 ——
   * 它是由 Esc / 点遮罩 / X 触发的真事件，伪造一个形状相近的对象会在调用方
   * 读 `details` 的其它字段时露馅（早先那版就是这么写的）。
   *
   * footer 的「取消」没有事件源，这里是 `null`，调用方拿到 `undefined`；
   * 那些只看第一个参数的调用方（绝大多数）不受影响。
   */
  const pendingDetails = React.useRef<unknown>(null)

  const close = React.useCallback(() => {
    setConfirming(false)
    const details = pendingDetails.current
    pendingDetails.current = null
    ;(onOpenChangeRef.current as ((open: boolean, details?: unknown) => void) | undefined)?.(
      false,
      details ?? undefined,
    )
  }, [])

  const requestClose = React.useCallback(() => {
    pendingDetails.current = null
    if (dirty) { setConfirming(true); return }
    close()
  }, [dirty, close])

  const gate = React.useMemo<SheetCloseGate>(
    () => ({ requestClose, dirty: !!dirty }),
    [requestClose, dirty],
  )
  // 提示渲染在 Root 旁边而不是当 children 塞进去：Base UI 的 children 允许是 render 函数，
  // 拼接后类型对不上；而提示本来就是挂在 body 上的 portal，和 Root 不需要父子关系。
  return (
    <SheetGateContext.Provider value={gate}>
    <SheetPrimitive.Root
      data-slot="sheet"
      {...props}
      /*
        挡点击外部。Base UI 的 prop 名是反的（disable*），默认 false = 允许关闭。

        **守卫模式下必须放开**：拦在这里的话，点遮罩的事件根本到不了下面的
        `onOpenChange`，闸门收不到、既不关也不弹确认框 —— 表现就是「点空白没反应」
        （LF 2026-09-10 截图抓到）。放开之后由闸门统一决定关还是问。
      */
      disablePointerDismissal={guarded ? false : !canDismiss}
      onOpenChange={(open, details) => {
        // ── 新逻辑（传了 dirty）──────────────────────────────────────────
        if (guarded && !open) {
          // 确认框开着时按 Esc：只关确认框，不能穿透关掉抽屉，也别再弹一次
          if (confirming) { details.cancel(); return }
          // 焦点移出是无意的（切个窗口、点了浮层），不算「试图关闭」，一律不响应
          if (details.reason === "focus-out") { details.cancel(); return }
          if (dirty) { details.cancel(); pendingDetails.current = details; setConfirming(true); return }
          onOpenChange?.(open, details)
          return
        }
        onOpenChange?.(open, details)
      }}
    />
    {/*
      确认框。渲染在 Root 旁边、**且只在需要时挂载** —— 它自己 portal 到 body，
      挂载顺序在抽屉之后，所以叠在抽屉之上；Esc 由最上层的可关闭层接走（上面
      `confirming` 那个分支是第二道保险，防止两层同时响应）。
    */}
    {confirming && (
      <ConfirmDialog
        open
        onOpenChange={(next: boolean) => { if (!next) setConfirming(false) }}
        title={t("sheet.discard.title")}
        description={t("sheet.discard.description")}
        cancelLabel={t("sheet.discard.keepEditing")}
        confirmLabel={t("sheet.discard.confirm")}
        // 丢的是用户敲进去的东西 —— 破坏性动作（PATTERNS 4.8 第 3 条）
        tone="destructive"
        onCancel={() => setConfirming(false)}
        onConfirm={() => { onDiscard?.(); close() }}
      />
    )}
    </SheetGateContext.Provider>
  )
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

/**
 * footer 的「取消」。**表单类抽屉一律用它，不要自己写 `onClick={() => onOpenChange(false)}`** ——
 * 那样会绕过脏检查，出现「Esc 问一句、取消直接关」两套语义。
 *
 * 为什么是一个组件而不是让页面调 `useSheetClose()`：闸门的 context 由 `Sheet` 提供，
 * 而页面的 hooks 跑在渲染出 `<Sheet>` 的那个组件体里 —— 在那儿调 `useSheetClose()`
 * 拿不到 context（provider 还没渲染）。做成组件，取用点自然落在 `Sheet` 里面。
 */
function SheetCancelButton({
  children,
  variant = "outline",
  ...props
}: React.ComponentProps<typeof Button>) {
  const t = useUiT()
  const { requestClose } = useSheetClose()
  return (
    <Button data-slot="sheet-cancel" variant={variant} onClick={requestClose} {...props}>
      {children === undefined ? t("shared.cancel") : children}
    </Button>
  )
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

/**
 * 宽度档位。
 *
 * ── 判据：内容形状 ────────────────────────────────────────────────────────
 * `sm` 给一个字段或一个决定；`md` 给一栏内容，也是默认档；`2xl` 给左右对照、
 * 可编辑 YAML、6 列以上表格等按列计算宽度的内容；`full` 只给三栏流水线。
 * 表单与详情都按这个判据选档，不因「可编辑 / 只读」或「表单 / 详情」直接升档。
 * 详情先按 PATTERNS 4.2 选择详情页或抽屉；选中抽屉后才使用这里的宽度档位。
 *
 * ── 官方的默认 384px 已从基类摘走 ────────────────────────────────────────
 * 它现在只长在 `auto` 档上（见文件头第 5 条）。留在基类上时它会压过所有档位，
 * 而且症状极隐蔽：带 `min-w-*` 的 `lg`/`2xl` 正常，`sm`/`md`/`full` 被静默夹到 384。
 * 全档带 `max-w-full` 兜底，窄窗口不横向溢出。
 */
const SHEET_SIZE = {
  /** 480px · **一个字段、一个决定**：扩缩容、改一个值、确认 */
  sm: "w-[480px] max-w-full",
  /**
   * 600px · **一栏内容**。**默认档，也是绝大多数表单的唯一档**。
   *
   * 单列、两列都在这一档 —— 列数是**内容的排布**，不是抽屉的形态，不该靠换宽度来实现。
   * 两列时每列约 268px（600 − 左右内边距 40 − 列间距 24，再对半），
   * 放得下一个 filled 字段；字段特别多或 label 特别长的，排单列。
   *
   * 确实需要更宽时：`size="auto"` + `className` 显式给宽度，并在代码上方写明理由。
   * 那是逃生口，不是第二个默认值。
   */
  md: "w-[600px] max-w-full",
  /**
   * 🧊 **已退役**（2026-09-04）。50%，720–1000。
   *
   * 它原本是「一栏 · 表单排两列」档。退役的理由：**列数是内容的排布，不是抽屉的形态** ——
   * 为了排两列就换一个更宽的抽屉，等于让布局细节决定容器尺寸。两列现在在 `md`
   * 里排，一栏表单只有 600 这一个宽度，少一次「该选哪档」的判断。
   *
   * **新页面不要用**。存量调用点（console 2 处、插件 4 处）保持不动，
   * 迁移时一并换成 `md`；真需要更宽的，走 `size="auto"` + 显式宽度并写明理由。
   */
  lg: "w-1/2 min-w-[720px] max-w-[1000px]",
  /**
   * 75%，min 900 · **两栏**：左右对照（版本对比、表单 + 代码并排）。
   *
   * 一栏但嵌了**按列算宽度的内容**（可编辑 YAML、6+ 列表格）也走这一档 ——
   * 代码是按列算的，与栏数、与可不可编辑都无关。
   *
   * 下限 900 不是 800：CodeEditor 是 13px 等宽 + 52px 行号槽，800px 只有约
   * 94 列（边缘），900px 约 105 列，装得下绝大多数 K8s CR。
   * **YAML 折行会误导语义** —— 缩进即结构，折行后看不出层级，这里不能将就。
   *
   * ⚠️ 用它之前先确认确有两栏或按列计算宽度的内容。75% 会盖掉大部分页面；
   * 详情若需要 URL，或内容多到需要分区 / 分页签，应按 PATTERNS 4.2 使用详情页。
   */
  "2xl": "w-3/4 min-w-[900px] max-w-full",
  /**
   * 视口宽 − 侧边栏 · **三栏流水线**：选 → 看 → 配。
   *
   * 只留侧栏可见是有意的：抽屉相对独立页的价值就是「没离开这个地方」，
   * 侧栏还在，用户知道自己仍在哪个模块里，关掉就回列表。全遮住就该用独立页了。
   *
   * ⚠️ **只给真正分了段的内容用。** 单列表单铺到 1600px 是本档最容易犯的错 ——
   * 字段有天然宽度上限，撑宽只会让右边空出一大片 —— 这正是当年"独立创建页横向太空旷"
   * 那个投诉的由来（独立页已废止，见 PATTERNS.md 4.1；分组多用锚点导航，见 4.6）。
   *
   * `--sidebar-width` 由 SidebarProvider 注入；不在侧栏布局里时兜底 16rem。
   */
  full: "w-[calc(100vw-var(--sidebar-width,16rem))] max-w-full",
  /**
   * 官方原样（≥640px 视口下 384px）。确实要自定义宽度时走这个，别去 className 里写死。
   *
   * `w-3/4` 与 `sm:max-w-sm` 本来长在基类上，**已一并挪到这里** —— 见文件头第 5 条。
   */
  auto: "w-3/4 sm:max-w-sm",
} as const

export type SheetSize = keyof typeof SHEET_SIZE

/** 写死宽度的检测：`w-` / `min-w-` / `max-w-` 开头，含 sm: 之类的变体前缀 */
const WIDTH_UTIL = /(^|\s)([a-z-]+:)*(min-|max-)?w-/

function SheetContent({
  className,
  children,
  side = "right",
  size = "md",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  /**
   * 宽度档位。**默认 `md`**，不是官方的 384px。
   *
   * 判据是**有几个并排的功能分区（栏）** —— 栏数在开发时是立刻知道的事实，
   * 内容宽度要估。绝大多数抽屉是一栏或三栏。
   *
   * | 形态 | 档 | 宽度 | 什么时候 |
   * |---|---|---|---|
   * | 一栏 | `sm` | 480 | 一个字段、一个决定 |
   * | | `md` | 600 | **一栏内容**；表单单列、两列都在这一档 |
   * | | ~~`lg`~~ | — | 🧊 已退役，两列改在 `md` 里排 |
   * | 两栏 | `2xl` | 75%，min 900 | 左右对照：版本对比、表单 + 代码并排 |
   * | 三栏 | `full` | 视口 − 侧栏 | 流水线：选 → 看 → 配 |
   * | — | `auto` | 384（官方原样） | 确实要自定义 |
   *
   * **例外**：一栏里嵌了按列算宽度的内容（可编辑 YAML、6+ 列表格）直接升 `2xl`，
   * 与栏数无关 —— 一栏的宽度跨度本来就大（480→1000），单靠栏数定不住。
   *
   * **详情用抽屉还是详情页**（2026-09-12 起两种都允许，PATTERNS 4.2）：
   * 要 URL（分享 / 刷新 / 回退）就必须是详情页 —— 抽屉没有 URL，这件事补不上；
   * 内容装得下、看完往往顺手改一下就用抽屉。只想瞄一眼用行展开。
   * 同一种资源**别同时做两套**，两个入口必然漂移。
   *
   * 判据全文见 `design/PATTERNS.md` 第 4 节。
   *
   * `side="top" / "bottom"` 时忽略 —— 那两个方向的尺寸是高度，规范没定义档位。
   */
  size?: SheetSize
  showCloseButton?: boolean
}) {
  const horizontal = side === "left" || side === "right"

  // 写死宽度会绕过档位，而且**在本地看起来是对的** —— 正是这个特性让本仓攒出了
  // 6 种宽度写法：每个作者都在自己那一处解决了问题，没人看见全局。
  // 所以要当场喊出来，把「本地正确」变成「全局可见的违规」。
  // 同 ResourceTable 的「固定列缺少 width」，只在 dev 生效。
  // typeof 判断不能省：Base UI 的 className 允许传函数（接收 popup state 再算类名），
  // 直接丢给正则会在运行期炸。函数形态放过 —— 那种写法本来就不该出现在这一族里。
  if (
    process.env.NODE_ENV !== "production" &&
    horizontal &&
    // `auto` 是**显式的**自定义档：传它就等于声明「这里我要自己给宽度」，
    // 再喊一遍就成了噪音 —— 那会逼人用别的歪招绕过警告。
    size !== "auto" &&
    typeof className === "string" &&
    WIDTH_UTIL.test(className)
  ) {
    console.warn(
      `[Sheet] className 里写死了宽度（${className}）。宽度请走 size 档位：` +
        `sm=480 一个决定 / md=600 一栏内容（表单单列两列都在这档）/ 2xl=代码、宽表格、左右对比；` +
        `lg 已退役。确实要自定义时传 size="auto" 再覆写并写明理由，见 design/PATTERNS.md 第 4 节`
    )
  }

  /**
   * 官方基类带 `gap-4`，会在 header / 工具栏 / 正文 / footer **每两个槽位之间各插 16px**。
   *
   * 槽位一多，这些 gap 叠起来非常显眼，而且**从块自己的 className 上完全看不出原因** ——
   * 两个结构和 padding 逐字相同的抽屉，一个写了 `gap-0` 一个没写，间距能差出 32px，
   * 排查时人会一路去调那个块的 padding（这一幕真发生过）。
   *
   * 所以超过两个槽位还没中和 gap 的，直接报出来。不改基类默认值是因为那会动到所有
   * 存量抽屉的观感；报一条足够让人当场知道该加什么。
   */
  if (process.env.NODE_ENV !== "production") {
    const slots = React.Children.toArray(children).length
    const neutralized = typeof className === "string" && /(^|\s)gap-/.test(className)
    if (slots > 2 && !neutralized) {
      console.warn(
        "[Sheet] SheetContent 有多个槽位但没中和基类的 `gap-4` —— " +
          "header / 工具栏 / 正文 / footer 之间会各多 16px。" +
          '加 `className="gap-0"`，间距交给各槽位自己的 padding。'
      )
    }
  }

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem]",
          // 档位排在官方基类之后、className 之前：既能盖掉 sm:max-w-sm，
          // 又不剥夺调用方最后覆写的权利（那条路配 size="auto" 走）
          horizontal && SHEET_SIZE[size],
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      // `pr-12` 是本地补丁：关闭按钮是 `absolute top-3 right-3` 的 28px 方块，
      // 官方 header 没给它留位 —— 任何在 header 右侧放东西的抽屉（模式切换、
      // 次要操作）都会被 X 压住。左对齐的标题不受影响，所以默认留出这一格更安全。
      className={cn("flex flex-col gap-0.5 p-4 pr-12", className)}
      {...props}
    />
  )
}

/**
 * 可滚动的正文区。**长表单必须用它**。
 *
 * 官方 `SheetContent` 只有 `flex flex-col gap-4` —— header / footer / 内容全在
 * 同一个 flex 流里，没有任何一段是可滚的，内容一长就直接溢出视口，底部的
 * 「取消 / 提交」跟着被推出屏幕外。而抽屉在本仓是**标准表单的默认形态**
 * （见 PATTERNS.md 4.1），长表单是常态不是例外。
 *
 * 结构：header 固定 → body 滚 → footer 固定（`SheetFooter` 自带 `mt-auto`）。
 *
 * 做成独立子组件而不是让 `SheetContent` 自动包住 children：后者要猜哪一段是
 * 正文，猜错就是不可预测的布局，也破坏了这一族的组合式 API。
 */
function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      // `min-h-0` 不能省：flex 子项默认 `min-height: auto`，不压到 0 的话
      // 它会被内容撑开而不是滚动 —— 表现是 overflow-y-auto 完全不起作用。
      //
      // `content-start` 同样不能省：本体是 `flex-1`（撑满抽屉高度），调用方普遍在
      // 上面加 `grid gap-5` 排字段，而 grid 的 `align-content` 默认 `stretch` ——
      // 内容不够高时**多余高度被平均分给每一行**，表现是字段之间拉开巨大空隙、
      // 末尾的说明块被抻成一个空盒子。块级 / 非换行 flex 布局下这个类无副作用。
      className={cn("min-h-0 flex-1 content-start overflow-y-auto px-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetCancelButton,
  SheetContent,
  SheetBody,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
