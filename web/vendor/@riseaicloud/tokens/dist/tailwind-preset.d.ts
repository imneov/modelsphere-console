/**
 * @riseaicloud/tokens/tailwind-preset
 *
 * Drop-in Tailwind CSS preset that wires up all Edge Design tokens.
 *
 * Usage in tailwind.config.js:
 *
 *   const edgePreset = require('@riseaicloud/tokens/tailwind-preset')
 *   module.exports = { presets: [edgePreset], content: [...] }
 */
declare const edgePreset: {
    darkMode: readonly ["class"];
    safelist: string[];
    theme: {
        container: {
            center: boolean;
            padding: string;
            screens: {
                '2xl': string;
            };
        };
        extend: {
            colors: Record<string, string | Record<string, string>>;
            borderRadius: {
                readonly none: "0";
                readonly sm: "calc(var(--radius) - 4px)";
                readonly md: "calc(var(--radius) - 2px)";
                readonly lg: "var(--radius)";
                readonly xl: "calc(var(--radius) + 4px)";
                readonly full: "9999px";
            };
            boxShadow: {
                readonly sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)";
                readonly md: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)";
                readonly lg: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)";
                readonly xl: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)";
            };
            zIndex: {
                [k: string]: string;
            };
            fontFamily: {
                readonly sans: readonly ["Inter", "-apple-system", "BlinkMacSystemFont", "\"Segoe UI\"", "Roboto", "\"Helvetica Neue\"", "Arial", "sans-serif", "\"Apple Color Emoji\"", "\"Segoe UI Emoji\""];
                readonly mono: readonly ["\"JetBrains Mono\"", "\"SF Mono\"", "Monaco", "\"Cascadia Code\"", "\"Fira Code\"", "Consolas", "\"Liberation Mono\"", "monospace"];
            };
            keyframes: {
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
            animation: {
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
            screens: {
                readonly sm: "640px";
                readonly md: "768px";
                readonly lg: "1024px";
                readonly xl: "1280px";
                readonly '2xl': "1400px";
            };
        };
    };
    plugins: (({ addBase }: {
        addBase: (styles: Record<string, Record<string, string>>) => void;
    }) => void)[];
};

export { edgePreset as default, edgePreset };
