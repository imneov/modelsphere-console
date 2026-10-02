/**
 * Geometry of the mark drawn by the Spinner's brand variants. Single source:
 * every animation range (sweep, fill, rotation centre) is derived from
 * width / height, so swapping the mark is a change to this file only.
 *
 * A neutral hexagonal ring rather than a product logo: this library carries no
 * trademark. A product can fork the path.
 */
export const BRAND_MARK = {
  /** One path, the inner hole as a second subpath (evenodd). */
  path:
    "M 128 8 L 232 68 L 232 188 L 128 248 L 24 188 L 24 68 Z M 128 52 L 194 90 L 194 166 L 128 204 L 62 166 L 62 90 Z",
  /** For contexts outside CSS (favicon); in the UI the mark follows currentColor. */
  color: "#2563EB",
  /** viewBox width and height. */
  width: 256,
  height: 256,
  /** Stroke of the `trace` variant: roughly a quarter of the ring's band (~38). */
  traceStroke: 10,
} as const
