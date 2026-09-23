// @riseaicloud/tokens is an ESM package; require() yields a namespace whose real
// preset is on .default. Passing the namespace straight to presets makes
// Tailwind read preset.theme as undefined and silently ignore it. (This bit
// Rise Global — see edge-desgin#12 / rise-global #430.)
const presetModule = require("@riseaicloud/tokens/tailwind-preset");
const edgePreset = presetModule.default ?? presetModule;

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [edgePreset],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    // @riseaicloud/ui ships no stylesheet — the consumer's Tailwind generates its
    // classes, so its dist MUST be scanned or classes like bg-card get purged.
    "./vendor/@riseaicloud/ui/dist/**/*.{js,mjs}",
  ],
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
};
