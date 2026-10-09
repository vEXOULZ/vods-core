// Number and placement helpers the pages' logic needs, the same as vexoulz-ui's `clamp` and `clampX`, kept here so the
// kit stays free of vexoulz-ui.

/** `value` within [min, max]. */
export function clamp(value: number, min = -Infinity, max = Infinity): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * How far to move a box spanning [left, right] sideways to keep it `margin` inside [0, viewport]: right if it starts
 * too far left, left if it ends too far right (but never so far its left edge leaves), 0 if it fits.
 */
export function clampX(left: number, right: number, viewport: number, margin = 8): number {
  if (left < margin) return margin - left
  if (right > viewport - margin) return Math.max(margin - left, viewport - margin - right)
  return 0
}
