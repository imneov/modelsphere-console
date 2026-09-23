/**
 * Edge Design System — Color Tokens
 *
 * All colors are defined as HSL channel values (e.g. "221.2 83.2% 53.3%")
 * so they can be used with Tailwind's opacity modifiers:
 *   bg-primary/50  →  hsl(221.2 83.2% 53.3% / 0.5)
 *
 * CSS custom property names match the Tailwind color keys.
 */
declare const lightColors: {
    readonly background: "0 0% 100%";
    readonly foreground: "222.2 84% 4.9%";
    readonly card: "0 0% 100%";
    readonly 'card-foreground': "222.2 84% 4.9%";
    readonly popover: "0 0% 100%";
    readonly 'popover-foreground': "222.2 84% 4.9%";
    readonly primary: "221.2 83.2% 53.3%";
    readonly 'primary-foreground': "210 40% 98%";
    readonly secondary: "210 40% 96%";
    readonly 'secondary-foreground': "222.2 84% 4.9%";
    readonly muted: "210 40% 96%";
    readonly 'muted-foreground': "215.4 16.3% 46.9%";
    readonly accent: "210 40% 96%";
    readonly 'accent-foreground': "222.2 84% 4.9%";
    readonly destructive: "0 84.2% 60.2%";
    readonly 'destructive-foreground': "210 40% 98%";
    readonly border: "214.3 31.8% 91.4%";
    readonly input: "214.3 31.8% 91.4%";
    readonly ring: "221.2 83.2% 53.3%";
    readonly 'surface-page': "210 45.5% 95.7%";
    readonly 'surface-toolbar': "210 50% 98.4%";
    readonly 'surface-section': "216 33.3% 97.1%";
    readonly 'surface-dialog-header': "220 100% 98.8%";
};
declare const darkColors: {
    readonly background: "222.2 84% 4.9%";
    readonly foreground: "210 40% 98%";
    readonly card: "217 33% 13%";
    readonly 'card-foreground': "210 40% 98%";
    readonly popover: "222.2 84% 4.9%";
    readonly 'popover-foreground': "210 40% 98%";
    readonly primary: "217.2 91.2% 59.8%";
    readonly 'primary-foreground': "222.2 84% 4.9%";
    readonly secondary: "217.2 32.6% 17.5%";
    readonly 'secondary-foreground': "210 40% 98%";
    readonly muted: "217.2 32.6% 17.5%";
    readonly 'muted-foreground': "215 20.2% 65.1%";
    readonly accent: "217.2 32.6% 17.5%";
    readonly 'accent-foreground': "210 40% 98%";
    readonly destructive: "0 62.8% 30.6%";
    readonly 'destructive-foreground': "210 40% 98%";
    readonly border: "217.2 32.6% 17.5%";
    readonly input: "217.2 32.6% 17.5%";
    readonly ring: "224.3 76.3% 94.1%";
    readonly 'surface-page': "222 47% 6%";
    readonly 'surface-toolbar': "217 33% 11%";
    readonly 'surface-section': "217 33% 9%";
    readonly 'surface-dialog-header': "217 33% 11%";
};
declare const cockpitColors: {
    readonly bg: "#F8FAFC";
    readonly bgSecondary: "#FFFFFF";
    readonly bgTertiary: "#F9FAFB";
    readonly bgElevated: "#FFFFFF";
    readonly border: "#E2E8F0";
    readonly borderSubtle: "#F1F5F9";
    readonly borderHover: "#CBD5E1";
    readonly text: "#1E293B";
    readonly textSecondary: "#475569";
    readonly textMuted: "#6B7280";
    readonly accent: "#3B82F6";
    readonly accentMuted: "rgba(59, 130, 246, 0.1)";
    readonly success: "#14B8A6";
    readonly successMuted: "rgba(20, 184, 166, 0.1)";
    readonly warning: "#F59E0B";
    readonly warningMuted: "rgba(245, 158, 11, 0.1)";
    readonly danger: "#EF4444";
    readonly dangerMuted: "rgba(239, 68, 68, 0.1)";
    readonly purple: "#8B5CF6";
    readonly purpleMuted: "rgba(139, 92, 246, 0.1)";
};
declare const topologyColors: {
    readonly bg: "#F5F7FA";
    readonly cluster: "#2D3748";
    readonly clusterForeground: "#FFFFFF";
    readonly nodeGroup: "#10B981";
    readonly nodeGroupForeground: "#FFFFFF";
    readonly node: "#10B981";
    readonly nodeForeground: "#065F46";
};
declare const darkCockpitColors: {
    readonly bg: "#0F172A";
    readonly bgSecondary: "#1E293B";
    readonly bgTertiary: "#172033";
    readonly bgElevated: "#1E293B";
    readonly border: "#334155";
    readonly borderSubtle: "#1E293B";
    readonly borderHover: "#475569";
    readonly text: "#F1F5F9";
    readonly textSecondary: "#CBD5E1";
    readonly textMuted: "#94A3B8";
    readonly accent: "#60A5FA";
    readonly accentMuted: "rgba(96, 165, 250, 0.15)";
    readonly success: "#2DD4BF";
    readonly successMuted: "rgba(45, 212, 191, 0.15)";
    readonly warning: "#FBBF24";
    readonly warningMuted: "rgba(251, 191, 36, 0.15)";
    readonly danger: "#F87171";
    readonly dangerMuted: "rgba(248, 113, 113, 0.15)";
    readonly purple: "#A78BFA";
    readonly purpleMuted: "rgba(167, 139, 250, 0.15)";
};
declare const darkTopologyColors: {
    readonly bg: "#0F172A";
    readonly cluster: "#475569";
    readonly clusterForeground: "#F1F5F9";
    readonly nodeGroup: "#34D399";
    readonly nodeGroupForeground: "#052E16";
    readonly node: "#34D399";
    readonly nodeForeground: "#052E16";
};
declare const statusColors: {
    readonly success: "#14B8A6";
    readonly warning: "#F59E0B";
    readonly error: "#EF4444";
    readonly info: "#3B82F6";
    readonly neutral: "#6B7280";
};
declare const surfaceColors: {
    /** @deprecated 用 `bg-surface-page` 代替 */
    readonly page: "#EFF4F9";
    /** @deprecated 用 `bg-surface-toolbar` 代替 */
    readonly toolbar: "#F9FBFD";
    /** @deprecated 用 `bg-surface-section` 代替 */
    readonly section: "#F5F7FA";
    /** @deprecated 用 `bg-surface-dialog-header` 代替 */
    readonly dialogHeader: "#F9FBFF";
    /** System base background (same as cockpitColors.bg) */
    readonly base: "#F8FAFC";
    /** Pure white elevated surface */
    readonly elevated: "#FFFFFF";
};
declare const chartColors: {
    readonly blue: "#3B82F6";
    readonly green: "#10B981";
    readonly teal: "#14B8A6";
    readonly amber: "#F59E0B";
    readonly red: "#EF4444";
    readonly purple: "#8B5CF6";
    readonly pink: "#EC4899";
    readonly cyan: "#06B6D4";
    /** Chart axis / grid line */
    readonly grid: "#E5E7EB";
    /** Chart tick / label text */
    readonly text: "#374151";
    /** Topology edge / connection line */
    readonly connection: "#64748B";
    /** Default monitoring line color */
    readonly monitoring: "#059669";
};
type SemanticColorKey = keyof typeof lightColors;
type CockpitColorKey = keyof typeof cockpitColors;
type TopologyColorKey = keyof typeof topologyColors;
type StatusColorKey = keyof typeof statusColors;
type SurfaceColorKey = keyof typeof surfaceColors;
type ChartColorKey = keyof typeof chartColors;

/**
 * Edge Design System — Typography Tokens
 */
declare const fontFamily: {
    readonly sans: readonly ["Inter", "-apple-system", "BlinkMacSystemFont", "\"Segoe UI\"", "Roboto", "\"Helvetica Neue\"", "Arial", "sans-serif", "\"Apple Color Emoji\"", "\"Segoe UI Emoji\""];
    readonly mono: readonly ["\"JetBrains Mono\"", "\"SF Mono\"", "Monaco", "\"Cascadia Code\"", "\"Fira Code\"", "Consolas", "\"Liberation Mono\"", "monospace"];
};
declare const fontSize: {
    readonly xs: readonly ["0.75rem", {
        readonly lineHeight: "1rem";
    }];
    readonly sm: readonly ["0.875rem", {
        readonly lineHeight: "1.25rem";
    }];
    readonly base: readonly ["1rem", {
        readonly lineHeight: "1.5rem";
    }];
    readonly lg: readonly ["1.125rem", {
        readonly lineHeight: "1.75rem";
    }];
    readonly xl: readonly ["1.25rem", {
        readonly lineHeight: "1.75rem";
    }];
    readonly '2xl': readonly ["1.5rem", {
        readonly lineHeight: "2rem";
    }];
    readonly '3xl': readonly ["1.875rem", {
        readonly lineHeight: "2.25rem";
    }];
    readonly '4xl': readonly ["2.25rem", {
        readonly lineHeight: "2.5rem";
    }];
};
/**
 * `--font-size-base` 的默认值 —— 正文基准字号，作用于 `body`。
 *
 * 与 `radiusBase` 同性质：一个可被消费方在 `:root` 或 `<html>` 上覆盖的**杠杆**，
 * 用来支持"字号偏好"这类用户可调项，改一处正文跟随。
 *
 * 刻意**只作用 body、不改根 font-size**：Tailwind 的间距/字号刻度全是 rem，动根字号会
 * 把整套布局一起缩放，blast radius 远超"把正文调大一点"的诉求。组件自己的 `text-xs`
 * / `text-sm` 是绝对 rem 值，不受此变量影响 —— 它只影响没有显式字号 class 的文本。
 *
 * 取值 `16px` = `fontSize.base`(1rem) = 浏览器默认，所以接入本 preset 的项目视觉零变化。
 */
declare const fontSizeBase = "16px";
declare const fontWeight: {
    readonly normal: "400";
    readonly medium: "500";
    readonly semibold: "600";
    readonly bold: "700";
};
declare const letterSpacing: {
    readonly tight: "-0.025em";
    readonly normal: "0em";
    readonly wide: "0.025em";
    readonly wider: "0.05em";
    readonly widest: "0.1em";
};
type FontSize = keyof typeof fontSize;
type FontWeight = keyof typeof fontWeight;

/**
 * Edge Design System — Spacing & Layout Tokens
 */
declare const spacing: {
    readonly 0: "0";
    readonly px: "1px";
    readonly 0.5: "0.125rem";
    readonly 1: "0.25rem";
    readonly 1.5: "0.375rem";
    readonly 2: "0.5rem";
    readonly 2.5: "0.625rem";
    readonly 3: "0.75rem";
    readonly 4: "1rem";
    readonly 5: "1.25rem";
    readonly 6: "1.5rem";
    readonly 8: "2rem";
    readonly 10: "2.5rem";
    readonly 12: "3rem";
    readonly 16: "4rem";
    readonly 20: "5rem";
    readonly 24: "6rem";
};
declare const radius: {
    readonly none: "0";
    readonly sm: "calc(var(--radius) - 4px)";
    readonly md: "calc(var(--radius) - 2px)";
    readonly lg: "var(--radius)";
    readonly xl: "calc(var(--radius) + 4px)";
    readonly full: "9999px";
};
declare const radiusBase = "0.5rem";
declare const shadows: {
    readonly sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)";
    readonly md: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)";
    readonly lg: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)";
    readonly xl: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)";
};
declare const zIndex: {
    readonly hide: -1;
    readonly base: 0;
    readonly dropdown: 1000;
    readonly sticky: 1100;
    readonly overlay: 1200;
    readonly modal: 1300;
    readonly popover: 1400;
    readonly toast: 1500;
    readonly tooltip: 1600;
};
declare const breakpoints: {
    readonly sm: "640px";
    readonly md: "768px";
    readonly lg: "1024px";
    readonly xl: "1280px";
    readonly '2xl': "1400px";
};
declare const container: {
    readonly center: true;
    readonly padding: "2rem";
    readonly maxWidth: "1400px";
};
type SpacingKey = keyof typeof spacing;
type RadiusKey = keyof typeof radius;
type ShadowKey = keyof typeof shadows;
type ZIndexKey = keyof typeof zIndex;
type BreakpointKey = keyof typeof breakpoints;

/**
 * Edge Design System — Motion Tokens
 */
declare const duration: {
    readonly fast: "150ms";
    readonly normal: "200ms";
    readonly slow: "300ms";
    readonly slower: "500ms";
    readonly slowest: "800ms";
};
declare const easing: {
    readonly default: "cubic-bezier(0.4, 0, 0.2, 1)";
    readonly in: "cubic-bezier(0.4, 0, 1, 1)";
    readonly out: "cubic-bezier(0, 0, 0.2, 1)";
    readonly inOut: "cubic-bezier(0.4, 0, 0.2, 1)";
    readonly spring: "cubic-bezier(0.34, 1.56, 0.64, 1)";
};
declare const keyframes: {
    readonly 'accordion-down': {
        readonly from: {
            readonly height: "0";
        };
        readonly to: {
            readonly height: "var(--radix-accordion-content-height)";
        };
    };
    readonly 'accordion-up': {
        readonly from: {
            readonly height: "var(--radix-accordion-content-height)";
        };
        readonly to: {
            readonly height: "0";
        };
    };
    readonly 'ring-fill': {
        readonly from: {
            readonly strokeDashoffset: "251";
        };
    };
    readonly 'status-pulse': {
        readonly '0%, 100%': {
            readonly opacity: "1";
        };
        readonly '50%': {
            readonly opacity: "0.6";
        };
    };
    readonly 'count-fade-in': {
        readonly from: {
            readonly opacity: "0";
            readonly transform: "translateY(2px)";
        };
        readonly to: {
            readonly opacity: "1";
            readonly transform: "translateY(0)";
        };
    };
    readonly 'fade-in': {
        readonly from: {
            readonly opacity: "0";
        };
        readonly to: {
            readonly opacity: "1";
        };
    };
    readonly 'fade-out': {
        readonly from: {
            readonly opacity: "1";
        };
        readonly to: {
            readonly opacity: "0";
        };
    };
    readonly 'slide-in-from-top': {
        readonly from: {
            readonly transform: "translateY(-100%)";
        };
        readonly to: {
            readonly transform: "translateY(0)";
        };
    };
    readonly 'slide-in-from-bottom': {
        readonly from: {
            readonly transform: "translateY(100%)";
        };
        readonly to: {
            readonly transform: "translateY(0)";
        };
    };
    readonly 'scale-in': {
        readonly from: {
            readonly opacity: "0";
            readonly transform: "scale(0.95)";
        };
        readonly to: {
            readonly opacity: "1";
            readonly transform: "scale(1)";
        };
    };
};
declare const animation: {
    readonly 'accordion-down': "accordion-down 0.2s ease-out";
    readonly 'accordion-up': "accordion-up 0.2s ease-out";
    readonly 'ring-fill': "ring-fill 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards";
    readonly 'status-pulse': "status-pulse 2s ease-in-out infinite";
    readonly 'count-fade-in': "count-fade-in 0.3s ease-out";
    readonly 'fade-in': "fade-in 0.2s ease-out";
    readonly 'fade-out': "fade-out 0.2s ease-out";
    readonly 'slide-in-from-top': "slide-in-from-top 0.2s ease-out";
    readonly 'slide-in-from-bottom': "slide-in-from-bottom 0.2s ease-out";
    readonly 'scale-in': "scale-in 0.2s ease-out";
};
type DurationKey = keyof typeof duration;
type EasingKey = keyof typeof easing;
type AnimationKey = keyof typeof animation;

/**
 * Edge Design System — Primary theme builder
 *
 * 换主色的机制是「覆盖 `--primary` 一个变量」（见 docs/customization/colors 的 Overriding
 * Tokens）。但一个主色不是一个 hex —— 它是四个值：浅色主色、暗色主色、以及**两种模式下各自
 * 的前景色**。后两个是最容易做错的部分，所以由本包负责算，消费方只需给出色值。
 *
 * **本文件刻意只提供算法、不提供主题目录。**「我们对外给用户哪几个主题、叫什么名」是产品
 * 决策，随时会加会删；固化成库的公开 API 会让加删主题变成版本事件。同仓的 `themes.ts` 就是
 * 前车之鉴：6 套 chrome 皮肤发成了公开 API，库内部一行没用过，现在想折叠进变量体系却必须走
 * deprecate 过渡期。目录放消费方，加一个主题改一行、不发包。
 */
/** 一个主色在明暗两态下的完整取值。均为 HSL 通道值，不含 `hsl()` 包裹，与其余 token 同格式。 */
interface PrimaryTheme {
    /** 浅色模式的 `--primary` */
    light: string;
    /** 暗色模式的 `--primary` */
    dark: string;
    /** 浅色模式的 `--primary-foreground` */
    fgLight: string;
    /** 暗色模式的 `--primary-foreground` */
    fgDark: string;
}
/** hex → HSL 通道值字符串，如 `'212 100% 45%'`。无法解析时返回 tokens 的默认主色。 */
declare function hexToHslChannels(hex: string): string;
/**
 * 由品牌色生成一套完整的主色取值。
 *
 * ```ts
 * // 彩色主题:明暗同色(深浅两态下同一个品牌色都成立)
 * buildPrimaryTheme('#006BE6')
 *
 * // 单色主题:浅色用近黑、暗色用近白 —— 主色是中性的,灰只用于色块标识
 * buildPrimaryTheme('#0A0A0B', '#FAFAFA')
 *
 * // 用户取色器同一条路,自定义不是特例
 * buildPrimaryTheme(pickedHex)
 * ```
 *
 * 算出来的值不满意就别用这个函数 —— `PrimaryTheme` 是公开类型，直接给字面量即可完全手控。
 *
 * @param light  浅色模式的主色（hex）
 * @param dark   暗色模式的主色（hex）。省略则与 `light` 相同
 */
declare function buildPrimaryTheme(light: string, dark?: string): PrimaryTheme;

/**
 * Edge Design System — Theme Tokens
 *
 * 6 built-in themes extracted from edge-console.
 * Each theme defines Tailwind utility classes for header, sidebar, and menu styling.
 * The theme system is extensible: consumers can register custom themes.
 */
interface ThemeColors {
    headerBg: string;
    headerBorder: string;
    hoverBg: string;
    divider: string;
    activeBg: string;
    activeHover: string;
    text: string;
    textMuted: string;
    textActive: string;
    logoBg: string;
    logoText: string;
    avatarBg: string;
    avatarText: string;
    selectorBg: string;
    selectorBorder: string;
    selectorHover: string;
    selectorIcon: string;
    selectorTitle: string;
    selectorSubtitle: string;
    selectorChevron: string;
    menuItemActiveBg: string;
    menuItemActiveText: string;
    menuItemActiveIcon: string;
    menuItemText: string;
    menuItemIcon: string;
    menuItemHoverBg: string;
    menuItemHoverText: string;
}
interface Theme {
    name: string;
    label: string;
    colors: ThemeColors;
}
declare const themes: Record<string, Theme>;
type ThemeName = keyof typeof themes;
/**
 * Get a theme by name, falling back to 'default'.
 */
declare function getTheme(name: string): Theme;
/**
 * Register a custom theme at runtime.
 */
declare function registerTheme(theme: Theme): void;

export { type AnimationKey, type BreakpointKey, type ChartColorKey, type CockpitColorKey, type DurationKey, type EasingKey, type FontSize, type FontWeight, type PrimaryTheme, type RadiusKey, type SemanticColorKey, type ShadowKey, type SpacingKey, type StatusColorKey, type SurfaceColorKey, type Theme, type ThemeColors, type ThemeName, type TopologyColorKey, type ZIndexKey, animation, breakpoints, buildPrimaryTheme, chartColors, cockpitColors, container, darkCockpitColors, darkColors, darkTopologyColors, duration, easing, fontFamily, fontSize, fontSizeBase, fontWeight, getTheme, hexToHslChannels, keyframes, letterSpacing, lightColors, radius, radiusBase, registerTheme, shadows, spacing, statusColors, surfaceColors, themes, topologyColors, zIndex };
