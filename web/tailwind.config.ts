// Loaded by Tailwind 4 through `@config` in src/index.css: the Rise tokens ship a
// Tailwind 3 preset, and v4 still reads JS configs for exactly this case.
import type { Config } from "tailwindcss";
import edgePreset from "@riseaicloud/tokens/tailwind-preset";
import animate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

export default {
  // The preset's d.ts is Tailwind 3's (`darkMode` typed readonly); runtime shape is fine.
  presets: [edgePreset as unknown as Config],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    // @riseaicloud/ui ships no stylesheet — the consumer's Tailwind generates its
    // classes, so its dist MUST be scanned or classes like bg-card get purged.
    "./vendor/@riseaicloud/ui/dist/**/*.{js,mjs}",
  ],
  plugins: [animate, typography],
} satisfies Config;
