'use strict';

// src/colors.ts
var lightColors = {
  background: "0 0% 100%",
  foreground: "222.2 84% 4.9%",
  card: "0 0% 100%",
  "card-foreground": "222.2 84% 4.9%",
  popover: "0 0% 100%",
  "popover-foreground": "222.2 84% 4.9%",
  primary: "221.2 83.2% 53.3%",
  "primary-foreground": "210 40% 98%",
  secondary: "210 40% 96%",
  "secondary-foreground": "222.2 84% 4.9%",
  muted: "210 40% 96%",
  "muted-foreground": "215.4 16.3% 46.9%",
  accent: "210 40% 96%",
  "accent-foreground": "222.2 84% 4.9%",
  destructive: "0 84.2% 60.2%",
  "destructive-foreground": "210 40% 98%",
  border: "214.3 31.8% 91.4%",
  input: "214.3 31.8% 91.4%",
  ring: "221.2 83.2% 53.3%",
  // ── Surface scale ────────────────────────────────────────────────────────
  // 页面 chrome 的层次：page（内容区底，最暗）< section < toolbar < card（浮起，最亮）。
  // 这就是 Edge Console 的核心视觉语言——「灰底 + 白卡浮起」。
  // 值 = surfaceColors 的 hex 机械转 HSL，浅色视觉零变化：
  //   page #EFF4F9 / toolbar #F9FBFD / section #F5F7FA / dialog-header #F9FBFF
  // 这三个色在 console 里有 650+ 处硬编码内联样式，token 化后才可能跟主题。
  "surface-page": "210 45.5% 95.7%",
  "surface-toolbar": "210 50% 98.4%",
  "surface-section": "216 33.3% 97.1%",
  "surface-dialog-header": "220 100% 98.8%"
};
var darkColors = {
  background: "222.2 84% 4.9%",
  foreground: "210 40% 98%",
  // 卡片比页面底亮 = 浮起。原值与 background 同为 4.9%（shadcn 的扁平模型，
  // 靠 border 区分层次），与浅色的「灰底 + 白卡浮起」不是同一套设计语言，
  // 且会导致 card 比 surface-page 更暗的倒挂。改为镜像浅色的层次模型。
  // 安全性：改动时暗色实质 0% 落地（全仓库仅 2 文件用 dark:），无存量受影响。
  card: "217 33% 13%",
  "card-foreground": "210 40% 98%",
  popover: "222.2 84% 4.9%",
  "popover-foreground": "210 40% 98%",
  primary: "217.2 91.2% 59.8%",
  "primary-foreground": "222.2 84% 4.9%",
  secondary: "217.2 32.6% 17.5%",
  "secondary-foreground": "210 40% 98%",
  muted: "217.2 32.6% 17.5%",
  "muted-foreground": "215 20.2% 65.1%",
  accent: "217.2 32.6% 17.5%",
  "accent-foreground": "210 40% 98%",
  destructive: "0 62.8% 30.6%",
  "destructive-foreground": "210 40% 98%",
  border: "217.2 32.6% 17.5%",
  input: "217.2 32.6% 17.5%",
  ring: "224.3 76.3% 94.1%",
  // ── Surface scale（暗色）─────────────────────────────────────────────────
  // 镜像浅色的相对层次：page < section < toolbar < card。
  // 色相保持 217–222 冷蓝灰（浅色的品牌感）；饱和度压到 33%（暗色高饱和显脏）。
  // 浅色： page 95.7% < section 97.1% < toolbar 98.4% < card 100%
  // 暗色： page 6%    < section 9%    < toolbar 11%   < card 13%
  "surface-page": "222 47% 6%",
  "surface-toolbar": "217 33% 11%",
  "surface-section": "217 33% 9%",
  "surface-dialog-header": "217 33% 11%"
};
var cockpitColors = {
  bg: "#F8FAFC",
  bgSecondary: "#FFFFFF",
  bgTertiary: "#F9FAFB",
  bgElevated: "#FFFFFF",
  border: "#E2E8F0",
  borderSubtle: "#F1F5F9",
  borderHover: "#CBD5E1",
  text: "#1E293B",
  textSecondary: "#475569",
  textMuted: "#6B7280",
  accent: "#3B82F6",
  accentMuted: "rgba(59, 130, 246, 0.1)",
  success: "#14B8A6",
  successMuted: "rgba(20, 184, 166, 0.1)",
  warning: "#F59E0B",
  warningMuted: "rgba(245, 158, 11, 0.1)",
  danger: "#EF4444",
  dangerMuted: "rgba(239, 68, 68, 0.1)",
  purple: "#8B5CF6",
  purpleMuted: "rgba(139, 92, 246, 0.1)"
};
var topologyColors = {
  bg: "#F5F7FA",
  cluster: "#2D3748",
  clusterForeground: "#FFFFFF",
  nodeGroup: "#10B981",
  nodeGroupForeground: "#FFFFFF",
  node: "#10B981",
  nodeForeground: "#065F46"
};
var darkCockpitColors = {
  bg: "#0F172A",
  bgSecondary: "#1E293B",
  bgTertiary: "#172033",
  bgElevated: "#1E293B",
  border: "#334155",
  borderSubtle: "#1E293B",
  borderHover: "#475569",
  text: "#F1F5F9",
  textSecondary: "#CBD5E1",
  textMuted: "#94A3B8",
  accent: "#60A5FA",
  accentMuted: "rgba(96, 165, 250, 0.15)",
  success: "#2DD4BF",
  successMuted: "rgba(45, 212, 191, 0.15)",
  warning: "#FBBF24",
  warningMuted: "rgba(251, 191, 36, 0.15)",
  danger: "#F87171",
  dangerMuted: "rgba(248, 113, 113, 0.15)",
  purple: "#A78BFA",
  purpleMuted: "rgba(167, 139, 250, 0.15)"
};
var darkTopologyColors = {
  bg: "#0F172A",
  // 浅色下 cluster 是深灰底 + 白字；暗色下深灰会与背景糊在一起，故提亮到 slate-600。
  cluster: "#475569",
  clusterForeground: "#F1F5F9",
  // 节点在暗底上要"发光"：亮绿底 + 深绿字，与浅色 node 的（中绿底 + 深绿字）同构。
  nodeGroup: "#34D399",
  nodeGroupForeground: "#052E16",
  node: "#34D399",
  nodeForeground: "#052E16"
};
var statusColors = {
  success: "#14B8A6",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",
  neutral: "#6B7280"
};
var surfaceColors = {
  /** @deprecated 用 `bg-surface-page` 代替 */
  page: "#EFF4F9",
  /** @deprecated 用 `bg-surface-toolbar` 代替 */
  toolbar: "#F9FBFD",
  /** @deprecated 用 `bg-surface-section` 代替 */
  section: "#F5F7FA",
  /** @deprecated 用 `bg-surface-dialog-header` 代替 */
  dialogHeader: "#F9FBFF",
  /** System base background (same as cockpitColors.bg) */
  base: "#F8FAFC",
  /** Pure white elevated surface */
  elevated: "#FFFFFF"
};
var chartColors = {
  blue: "#3B82F6",
  green: "#10B981",
  teal: "#14B8A6",
  amber: "#F59E0B",
  red: "#EF4444",
  purple: "#8B5CF6",
  pink: "#EC4899",
  cyan: "#06B6D4",
  /** Chart axis / grid line */
  grid: "#E5E7EB",
  /** Chart tick / label text */
  text: "#374151",
  /** Topology edge / connection line */
  connection: "#64748B",
  /** Default monitoring line color */
  monitoring: "#059669"
};

// src/typography.ts
var fontFamily = {
  sans: [
    "Inter",
    "-apple-system",
    "BlinkMacSystemFont",
    '"Segoe UI"',
    "Roboto",
    '"Helvetica Neue"',
    "Arial",
    "sans-serif",
    '"Apple Color Emoji"',
    '"Segoe UI Emoji"'
  ],
  mono: [
    '"JetBrains Mono"',
    '"SF Mono"',
    "Monaco",
    '"Cascadia Code"',
    '"Fira Code"',
    "Consolas",
    '"Liberation Mono"',
    "monospace"
  ]
};
var fontSize = {
  xs: ["0.75rem", { lineHeight: "1rem" }],
  sm: ["0.875rem", { lineHeight: "1.25rem" }],
  base: ["1rem", { lineHeight: "1.5rem" }],
  lg: ["1.125rem", { lineHeight: "1.75rem" }],
  xl: ["1.25rem", { lineHeight: "1.75rem" }],
  "2xl": ["1.5rem", { lineHeight: "2rem" }],
  "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
  "4xl": ["2.25rem", { lineHeight: "2.5rem" }]
};
var fontSizeBase = "16px";
var fontWeight = {
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700"
};
var letterSpacing = {
  tight: "-0.025em",
  normal: "0em",
  wide: "0.025em",
  wider: "0.05em",
  widest: "0.1em"
};

// src/spacing.ts
var spacing = {
  0: "0",
  px: "1px",
  0.5: "0.125rem",
  1: "0.25rem",
  1.5: "0.375rem",
  2: "0.5rem",
  2.5: "0.625rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
  16: "4rem",
  20: "5rem",
  24: "6rem"
};
var radius = {
  none: "0",
  sm: "calc(var(--radius) - 4px)",
  md: "calc(var(--radius) - 2px)",
  lg: "var(--radius)",
  xl: "calc(var(--radius) + 4px)",
  full: "9999px"
};
var radiusBase = "0.5rem";
var shadows = {
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  md: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  lg: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  xl: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)"
};
var zIndex = {
  hide: -1,
  base: 0,
  dropdown: 1e3,
  sticky: 1100,
  overlay: 1200,
  modal: 1300,
  popover: 1400,
  toast: 1500,
  tooltip: 1600
};
var breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1400px"
};
var container = {
  center: true,
  padding: "2rem",
  maxWidth: "1400px"
};

// src/motion.ts
var duration = {
  fast: "150ms",
  normal: "200ms",
  slow: "300ms",
  slower: "500ms",
  slowest: "800ms"
};
var easing = {
  default: "cubic-bezier(0.4, 0, 0.2, 1)",
  in: "cubic-bezier(0.4, 0, 1, 1)",
  out: "cubic-bezier(0, 0, 0.2, 1)",
  inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)"
};
var keyframes = {
  "accordion-down": {
    from: { height: "0" },
    to: { height: "var(--radix-accordion-content-height)" }
  },
  "accordion-up": {
    from: { height: "var(--radix-accordion-content-height)" },
    to: { height: "0" }
  },
  "ring-fill": {
    from: { strokeDashoffset: "251" }
  },
  "status-pulse": {
    "0%, 100%": { opacity: "1" },
    "50%": { opacity: "0.6" }
  },
  "count-fade-in": {
    from: { opacity: "0", transform: "translateY(2px)" },
    to: { opacity: "1", transform: "translateY(0)" }
  },
  "fade-in": {
    from: { opacity: "0" },
    to: { opacity: "1" }
  },
  "fade-out": {
    from: { opacity: "1" },
    to: { opacity: "0" }
  },
  "slide-in-from-top": {
    from: { transform: "translateY(-100%)" },
    to: { transform: "translateY(0)" }
  },
  "slide-in-from-bottom": {
    from: { transform: "translateY(100%)" },
    to: { transform: "translateY(0)" }
  },
  "scale-in": {
    from: { opacity: "0", transform: "scale(0.95)" },
    to: { opacity: "1", transform: "scale(1)" }
  }
};
var animation = {
  "accordion-down": "accordion-down 0.2s ease-out",
  "accordion-up": "accordion-up 0.2s ease-out",
  "ring-fill": "ring-fill 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards",
  "status-pulse": "status-pulse 2s ease-in-out infinite",
  "count-fade-in": "count-fade-in 0.3s ease-out",
  "fade-in": "fade-in 0.2s ease-out",
  "fade-out": "fade-out 0.2s ease-out",
  "slide-in-from-top": "slide-in-from-top 0.2s ease-out",
  "slide-in-from-bottom": "slide-in-from-bottom 0.2s ease-out",
  "scale-in": "scale-in 0.2s ease-out"
};

// src/primary-theme.ts
var FG_ON_DARK_COLOR = lightColors["primary-foreground"];
var FG_ON_LIGHT_COLOR = darkColors["primary-foreground"];
var WHITE_CONTRAST_FLOOR = 3.5;
function parseHex(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const n = parseInt(h, 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
var round1 = (x) => Math.round(x * 10) / 10;
function hexToHslChannels(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return lightColors.primary;
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = (g - b) / d % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${round1(h)} ${round1(s * 100)}% ${round1(l * 100)}%`;
}
function relativeLuminance(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function pickForeground(hex) {
  const contrastWithWhite = 1.05 / (relativeLuminance(hex) + 0.05);
  return contrastWithWhite < WHITE_CONTRAST_FLOOR ? FG_ON_LIGHT_COLOR : FG_ON_DARK_COLOR;
}
function buildPrimaryTheme(light, dark = light) {
  return {
    light: hexToHslChannels(light),
    dark: hexToHslChannels(dark),
    fgLight: pickForeground(light),
    fgDark: pickForeground(dark)
  };
}

// src/themes.ts
var themes = {
  default: {
    name: "default",
    label: "\u7ECF\u5178\u84DD",
    colors: {
      headerBg: "bg-[#1e293b]",
      headerBorder: "border-slate-700",
      hoverBg: "hover:bg-slate-700",
      divider: "bg-slate-600",
      activeBg: "bg-[#2563eb]",
      activeHover: "hover:bg-[#1d4ed8]",
      text: "text-white",
      textMuted: "text-slate-400",
      textActive: "text-white",
      logoBg: "bg-[#2563eb]",
      logoText: "text-white",
      avatarBg: "bg-[#2563eb]",
      avatarText: "text-white",
      selectorBg: "bg-[#1e293b]",
      selectorBorder: "border-[#1e293b]",
      selectorHover: "hover:bg-[#1e293b]",
      selectorIcon: "text-white",
      selectorTitle: "text-white",
      selectorSubtitle: "text-white/70",
      selectorChevron: "text-white",
      menuItemActiveBg: "bg-blue-50",
      menuItemActiveText: "text-blue-600",
      menuItemActiveIcon: "text-blue-600",
      menuItemText: "text-gray-700",
      menuItemIcon: "text-gray-600",
      menuItemHoverBg: "hover:bg-gray-50",
      menuItemHoverText: "hover:text-gray-900"
    }
  },
  purple: {
    name: "purple",
    label: "\u4F18\u96C5\u7D2B\u8272",
    colors: {
      headerBg: "bg-[#2d1b3d]",
      headerBorder: "border-purple-900",
      hoverBg: "hover:bg-purple-900/50",
      divider: "bg-purple-800",
      activeBg: "bg-purple-600",
      activeHover: "hover:bg-purple-700",
      text: "text-white",
      textMuted: "text-purple-300",
      textActive: "text-white",
      logoBg: "bg-gradient-to-br from-purple-400 to-purple-600",
      logoText: "text-white",
      avatarBg: "bg-gradient-to-br from-purple-400 to-purple-600",
      avatarText: "text-white",
      selectorBg: "bg-purple-100",
      selectorBorder: "border-purple-300",
      selectorHover: "hover:bg-purple-200",
      selectorIcon: "text-purple-700",
      selectorTitle: "text-purple-900",
      selectorSubtitle: "text-purple-700",
      selectorChevron: "text-purple-700",
      menuItemActiveBg: "bg-purple-50",
      menuItemActiveText: "text-purple-600",
      menuItemActiveIcon: "text-purple-600",
      menuItemText: "text-gray-700",
      menuItemIcon: "text-gray-600",
      menuItemHoverBg: "hover:bg-gray-50",
      menuItemHoverText: "hover:text-gray-900"
    }
  },
  green: {
    name: "green",
    label: "\u6E05\u65B0\u7EFF\u8272",
    colors: {
      headerBg: "bg-[#1a2f2a]",
      headerBorder: "border-emerald-900",
      hoverBg: "hover:bg-emerald-900/50",
      divider: "bg-emerald-800",
      activeBg: "bg-emerald-600",
      activeHover: "hover:bg-emerald-700",
      text: "text-white",
      textMuted: "text-emerald-300",
      textActive: "text-white",
      logoBg: "bg-gradient-to-br from-emerald-400 to-emerald-600",
      logoText: "text-white",
      avatarBg: "bg-gradient-to-br from-emerald-400 to-emerald-600",
      avatarText: "text-white",
      selectorBg: "bg-emerald-100",
      selectorBorder: "border-emerald-300",
      selectorHover: "hover:bg-emerald-200",
      selectorIcon: "text-emerald-700",
      selectorTitle: "text-emerald-900",
      selectorSubtitle: "text-emerald-700",
      selectorChevron: "text-emerald-700",
      menuItemActiveBg: "bg-emerald-50",
      menuItemActiveText: "text-emerald-600",
      menuItemActiveIcon: "text-emerald-600",
      menuItemText: "text-gray-700",
      menuItemIcon: "text-gray-600",
      menuItemHoverBg: "hover:bg-gray-50",
      menuItemHoverText: "hover:text-gray-900"
    }
  },
  orange: {
    name: "orange",
    label: "\u6D3B\u529B\u6A59\u8272",
    colors: {
      headerBg: "bg-[#2d1f1a]",
      headerBorder: "border-orange-900",
      hoverBg: "hover:bg-orange-900/50",
      divider: "bg-orange-800",
      activeBg: "bg-orange-600",
      activeHover: "hover:bg-orange-700",
      text: "text-white",
      textMuted: "text-orange-300",
      textActive: "text-white",
      logoBg: "bg-gradient-to-br from-orange-400 to-orange-600",
      logoText: "text-white",
      avatarBg: "bg-gradient-to-br from-orange-400 to-orange-600",
      avatarText: "text-white",
      selectorBg: "bg-orange-100",
      selectorBorder: "border-orange-300",
      selectorHover: "hover:bg-orange-200",
      selectorIcon: "text-orange-700",
      selectorTitle: "text-orange-900",
      selectorSubtitle: "text-orange-700",
      selectorChevron: "text-orange-700",
      menuItemActiveBg: "bg-orange-50",
      menuItemActiveText: "text-orange-600",
      menuItemActiveIcon: "text-orange-600",
      menuItemText: "text-gray-700",
      menuItemIcon: "text-gray-600",
      menuItemHoverBg: "hover:bg-gray-50",
      menuItemHoverText: "hover:text-gray-900"
    }
  },
  dark: {
    name: "dark",
    label: "\u6697\u591C\u9ED1\u8272",
    colors: {
      headerBg: "bg-[#0f1419]",
      headerBorder: "border-gray-900",
      hoverBg: "hover:bg-gray-800/50",
      divider: "bg-gray-700",
      activeBg: "bg-gray-700",
      activeHover: "hover:bg-gray-600",
      text: "text-white",
      textMuted: "text-gray-400",
      textActive: "text-white",
      logoBg: "bg-gray-700",
      logoText: "text-white",
      avatarBg: "bg-gray-700",
      avatarText: "text-white",
      selectorBg: "bg-gray-300",
      selectorBorder: "border-gray-400",
      selectorHover: "hover:bg-gray-400",
      selectorIcon: "text-gray-800",
      selectorTitle: "text-gray-900",
      selectorSubtitle: "text-gray-700",
      selectorChevron: "text-gray-800",
      menuItemActiveBg: "bg-gray-200",
      menuItemActiveText: "text-gray-900",
      menuItemActiveIcon: "text-gray-900",
      menuItemText: "text-gray-700",
      menuItemIcon: "text-gray-600",
      menuItemHoverBg: "hover:bg-gray-50",
      menuItemHoverText: "hover:text-gray-900"
    }
  },
  cyan: {
    name: "cyan",
    label: "\u79D1\u6280\u9752\u8272",
    colors: {
      headerBg: "bg-[#0f2a2e]",
      headerBorder: "border-cyan-900",
      hoverBg: "hover:bg-cyan-900/50",
      divider: "bg-cyan-800",
      activeBg: "bg-cyan-600",
      activeHover: "hover:bg-cyan-700",
      text: "text-white",
      textMuted: "text-cyan-300",
      textActive: "text-white",
      logoBg: "bg-gradient-to-br from-cyan-400 to-cyan-600",
      logoText: "text-white",
      avatarBg: "bg-gradient-to-br from-cyan-400 to-cyan-600",
      avatarText: "text-white",
      selectorBg: "bg-cyan-100",
      selectorBorder: "border-cyan-300",
      selectorHover: "hover:bg-cyan-200",
      selectorIcon: "text-cyan-700",
      selectorTitle: "text-cyan-900",
      selectorSubtitle: "text-cyan-700",
      selectorChevron: "text-cyan-700",
      menuItemActiveBg: "bg-cyan-50",
      menuItemActiveText: "text-cyan-600",
      menuItemActiveIcon: "text-cyan-600",
      menuItemText: "text-gray-700",
      menuItemIcon: "text-gray-600",
      menuItemHoverBg: "hover:bg-gray-50",
      menuItemHoverText: "hover:text-gray-900"
    }
  }
};
function getTheme(name) {
  return themes[name] ?? themes.default;
}
function registerTheme(theme) {
  themes[theme.name] = theme;
}

exports.animation = animation;
exports.breakpoints = breakpoints;
exports.buildPrimaryTheme = buildPrimaryTheme;
exports.chartColors = chartColors;
exports.cockpitColors = cockpitColors;
exports.container = container;
exports.darkCockpitColors = darkCockpitColors;
exports.darkColors = darkColors;
exports.darkTopologyColors = darkTopologyColors;
exports.duration = duration;
exports.easing = easing;
exports.fontFamily = fontFamily;
exports.fontSize = fontSize;
exports.fontSizeBase = fontSizeBase;
exports.fontWeight = fontWeight;
exports.getTheme = getTheme;
exports.hexToHslChannels = hexToHslChannels;
exports.keyframes = keyframes;
exports.letterSpacing = letterSpacing;
exports.lightColors = lightColors;
exports.radius = radius;
exports.radiusBase = radiusBase;
exports.registerTheme = registerTheme;
exports.shadows = shadows;
exports.spacing = spacing;
exports.statusColors = statusColors;
exports.surfaceColors = surfaceColors;
exports.themes = themes;
exports.topologyColors = topologyColors;
exports.zIndex = zIndex;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map