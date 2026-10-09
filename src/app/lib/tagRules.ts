// The archive's rules for a tag's name and colors (docs/admin-api.md, "Site tags"), with no imports: the site checks
// them (lib/vodTags.ts, Manage) and so does the dev entry's mock archive (src/dev/adminMock.ts), which runs in a site's
// vite config and must not load vue or the app.

export const TAG_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/
const COLOR_FUNCS = ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix']
const MATH_FUNCS = ['calc', 'min', 'max', 'clamp']
export const TAG_COLOR_MAX = 160
/**
 * Colors a tag may have: a hex, a theme token (any `var(--…)` without a fallback: `var(--vx-ok)`, `var(--k-ok)`), a named color, or a color function, which may hold
 * theme tokens, math and other colors (`oklch(from var(--vx-accent) calc(l - 0.15) c h)`,
 * `color-mix(in oklch, var(--vx-ok) 60%, white)`). Nothing else gets in: no other functions (so no url()), quotes,
 * escapes, `;`, `:` or braces. The archive checks the same (docs/admin-api.md, "Site tags").
 */
export function isTagColor(c: string): boolean {
  if (c.length > TAG_COLOR_MAX || !/^[#0-9a-z.,%\s/()*+-]+$/i.test(c)) return false
  if (/^#[0-9a-f]{3,8}$/i.test(c) || /^[a-z]{3,20}$/i.test(c)) return true
  // Theme tokens are the only var() and the only `--`.
  const rest = c.replace(/var\(--[a-z][a-z0-9-]*\)/gi, 'v')
  if (/--|var\(/i.test(rest)) return false
  if (rest === 'v') return true
  // One color function around the whole thing; any function inside is a color or math one.
  const outer = /^([a-z-]+)\(/i.exec(rest)
  if (!outer || !COLOR_FUNCS.includes(outer[1]!.toLowerCase()) || !rest.endsWith(')')) return false
  let depth = 0
  for (const m of rest.matchAll(/([a-z-]*)\(|\)/gi)) {
    if (m[0] === ')') {
      if (--depth < 0) return false
      if (depth === 0 && m.index !== rest.length - 1) return false
    } else {
      if (!m[1] || ![...COLOR_FUNCS, ...MATH_FUNCS].includes(m[1].toLowerCase()) || ++depth > 4) return false
    }
  }
  return depth === 0
}
