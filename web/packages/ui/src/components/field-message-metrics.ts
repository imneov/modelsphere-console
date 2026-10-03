// 字段框外那一行（校验反馈 / 警示条）的几何常量 —— 纯数字 + 对应的类名，没有 React。
//
// 这几个值必须一起动：反馈行「借」了字段之间多少间距，就要用等量的负外边距抵掉多少，
// 警示条也按同一个数让位。两次错位（错误压住警示条、错误换行被下一个字段遮住）都是
// 其中一个改了另一个没跟上。**类名也从这里取**，floating-field 里不再写字面量 ——
// 只导出数字的话，改 `gap-2` 不会让任何测试变红，这个模块就白设了。
// 单独一个文件是为了能在 node 下单测（floating-field 是 .tsx）。
//
// px 值按默认密度写；紧凑 / 宽松档下 `--spacing` 会整体缩放，但每一项都是 spacing 单位，
// 相互抵消的关系不变。

/** 反馈行 `text-xs` + `leading-4` 的行高。 */
export const MSG_LINE_H = 16
export const MSG_LINE_CLS = "leading-4"
/** 反馈行与框底之间的间距。 */
export const MSG_GAP = 4
/**
 * 单行反馈占的高度。反馈行**参与布局**，但用等值的负下外边距把这一段抵掉 ——
 * 所以单行反馈的外框高度与没有反馈时一致（出错不会「一报错整张表跳一下」），
 * 只有换行时才按超出的部分把下方推开，不再被下一个字段遮住。
 */
export const MSG_RESERVE = MSG_GAP + MSG_LINE_H

/** 带框那几档外层容器的 flex gap。 */
export const FIELD_GAP = 8
export const FIELD_GAP_CLS = "gap-2"
/** `option` 档没有框，外层 gap 直接就是 MSG_GAP。 */
export const OPTION_GAP = 4
export const OPTION_GAP_CLS = "gap-1"
/** 警示条自身的下移；加上 FIELD_GAP 正好等于 MSG_RESERVE。 */
export const NOTICE_SHIFT = 12
export const NOTICE_SHIFT_CLS = "mt-3"

/** 抵掉 MSG_RESERVE 的负下外边距；四档共用。 */
export const MSG_RESERVE_CLS = "-mb-5"
/** 把外层的 FIELD_GAP 收到 MSG_GAP；`option` 档不用（它的 gap 本来就是 MSG_GAP）。 */
export const MSG_TIGHTEN_CLS = "-mt-1"
/**
 * 反馈行会超出外框底部 MSG_RESERVE - 余量，四档都要留同一份余量，
 * 否则它会探进相邻字段的位置里。
 */
export const MSG_PAD_CLS = "pb-1.5"
