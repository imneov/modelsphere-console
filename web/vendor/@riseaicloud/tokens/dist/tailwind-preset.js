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
var fontSizeBase = "16px";

// src/spacing.ts
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

// src/motion.ts
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

// src/tailwind-preset.ts
function buildSemanticColors(tokens) {
  const colors = {};
  const grouped = {};
  for (const key of Object.keys(tokens)) {
    const parts = key.split("-");
    if (parts.length === 2) {
      const [group, variant] = parts;
      if (!grouped[group]) grouped[group] = {};
      grouped[group][variant] = `hsl(var(--${key}))`;
    } else {
      colors[key] = `hsl(var(--${key}))`;
    }
  }
  for (const [group, variants] of Object.entries(grouped)) {
    if (colors[group]) {
      colors[group] = { DEFAULT: colors[group], ...variants };
    } else {
      colors[group] = variants;
    }
  }
  return colors;
}
function buildCSSVars(tokens) {
  const vars = {};
  for (const [key, value] of Object.entries(tokens)) {
    vars[`--${key}`] = value;
  }
  return vars;
}
function buildCockpitCSSVars(tokens) {
  const vars = {};
  for (const [key, value] of Object.entries(tokens)) {
    const cssKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
    vars[`--cockpit-${cssKey}`] = value;
  }
  return vars;
}
function buildTopologyCSSVars(tokens) {
  const vars = {};
  for (const [key, value] of Object.entries(tokens)) {
    const cssKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
    vars[`--${cssKey}`] = value;
  }
  return vars;
}
var edgePreset = {
  darkMode: ["class"],
  // Tailwind content-matches even the class selectors that `addBase` emits: if the
  // string "dark" never appears in the consumer's scanned content, the whole `.dark`
  // block is dropped and dark mode silently does nothing. Apps that toggle the class
  // from JS without writing a single `dark:` utility would hit exactly that. Pinning
  // it here means every consumer of the preset is immune by default.
  safelist: ["dark"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px"
      }
    },
    extend: {
      colors: buildSemanticColors(lightColors),
      borderRadius: radius,
      boxShadow: shadows,
      zIndex: Object.fromEntries(
        Object.entries(zIndex).map(([k, v]) => [k, String(v)])
      ),
      fontFamily,
      keyframes,
      animation,
      screens: breakpoints
    }
  },
  plugins: [
    // Inject CSS custom properties via a Tailwind plugin
    function({ addBase }) {
      addBase({
        ":root": {
          "--radius": radiusBase,
          "--font-size-base": fontSizeBase,
          ...buildCSSVars(lightColors),
          ...buildCockpitCSSVars(cockpitColors),
          ...buildTopologyCSSVars({
            "topology-bg": topologyColors.bg,
            cluster: topologyColors.cluster,
            "cluster-foreground": topologyColors.clusterForeground,
            "node-group": topologyColors.nodeGroup,
            "node-group-foreground": topologyColors.nodeGroupForeground,
            node: topologyColors.node,
            "node-foreground": topologyColors.nodeForeground
          })
        },
        ".dark": {
          ...buildCSSVars(darkColors),
          // 此前 .dark 只覆盖语义 token，--cockpit-* / --topology-* 只在 :root 定义过 ——
          // 暗色下监控面板与拓扑图纹丝不动，且因为 cockpit.bg 是 #F8FAFC（近白），
          // 整个面板在暗色主题下仍是白底黑字。
          ...buildCockpitCSSVars(darkCockpitColors),
          ...buildTopologyCSSVars({
            "topology-bg": darkTopologyColors.bg,
            cluster: darkTopologyColors.cluster,
            "cluster-foreground": darkTopologyColors.clusterForeground,
            "node-group": darkTopologyColors.nodeGroup,
            "node-group-foreground": darkTopologyColors.nodeGroupForeground,
            node: darkTopologyColors.node,
            "node-foreground": darkTopologyColors.nodeForeground
          })
        }
      });
      addBase({
        "*": { "border-color": "hsl(var(--border))" },
        body: {
          "background-color": "hsl(var(--background))",
          color: "hsl(var(--foreground))",
          // 正文基准字号的落点。默认 16px = 浏览器默认,接入 preset 不产生视觉变化;
          // 消费方覆盖 --font-size-base 即可实现"字号偏好"。见 typography.ts 的注释。
          "font-size": "var(--font-size-base)"
        }
      });
    }
  ]
};
var tailwind_preset_default = edgePreset;

export { tailwind_preset_default as default, edgePreset };
//# sourceMappingURL=tailwind-preset.js.map
//# sourceMappingURL=tailwind-preset.js.map