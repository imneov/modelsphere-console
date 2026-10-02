// Loaded by Tailwind 4 through `@config` in src/index.css: the token preset is a
// Tailwind 3-style preset, and v4 still reads JS configs for exactly this case.
import type { Config } from "tailwindcss";
import preset from "@modelsphere/ui/tailwind-preset";
import animate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

export default {
  presets: [preset as Config],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    // The UI package ships no stylesheet: the consumer's Tailwind generates
    // its classes, so its sources must be scanned or e.g. bg-card is purged.
    "./packages/ui/src/**/*.{ts,tsx}",
  ],
  plugins: [animate, typography],
} satisfies Config;
