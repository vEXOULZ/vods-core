// The Settings page's drafts: what each control edits (numbers and lists as the text typed), the checks the worker
// makes, and the PATCH body with only what changed. Pure functions; the page holds the drafts.
import type { RuntimeSetting, SettingValue } from './api'

/** A control's value: text for numbers and lists (one name per line), the value itself otherwise. */
export type SettingDraft = boolean | string | Record<string, string[]>

export function toDraft(s: Pick<RuntimeSetting, 'type' | 'value'>): SettingDraft {
  switch (s.type) {
    case 'bool': return !!s.value
    case 'int':
    case 'float': return String(s.value ?? '')
    case 'list': return (Array.isArray(s.value) ? s.value : []).join('\n')
    // A plain copy: the value may be a reactive proxy, which structuredClone refuses.
    case 'steps': return Object.fromEntries(Object.entries((s.value ?? {}) as Record<string, string[]>).map(([k, v]) => [k, [...v]]))
    default: return String(s.value ?? '')
  }
}

/** The draft as the value the API takes, or a problem to show under the control. */
export function fromDraft(s: RuntimeSetting, d: SettingDraft): { value: SettingValue } | { error: string } {
  switch (s.type) {
    case 'bool': return { value: !!d }
    case 'int':
    case 'float': {
      const text = String(d).trim()
      const n = Number(text)
      if (!text || !Number.isFinite(n)) return { error: 'A number.' }
      if (s.type === 'int' && !Number.isInteger(n)) return { error: 'A whole number.' }
      if (s.min != null && n < s.min) return { error: `At least ${s.min}.` }
      if (s.max != null && n > s.max) return { error: `At most ${s.max}.` }
      return { value: n }
    }
    case 'list': return { value: [...new Set(String(d).split('\n').map((x) => x.trim()).filter(Boolean))] }
    case 'steps': {
      const out: Record<string, string[]> = {}
      for (const [kind, steps] of Object.entries(d as Record<string, string[]>)) {
        // In the order the job runs them, as the worker keeps them.
        const order = s.choices?.[kind] ?? steps
        const picked = order.filter((x) => steps.includes(x))
        if (picked.length) out[kind] = picked
      }
      return { value: out }
    }
    default: {
      const text = String(d)
      return text.length > 500 ? { error: 'At most 500 characters.' } : { value: text }
    }
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Settings whose draft differs from the saved value: the PATCH body, and problems by key. */
export function settingChanges(items: readonly RuntimeSetting[], drafts: Record<string, SettingDraft>) {
  const changes: Record<string, SettingValue> = {}
  const errors = new Map<string, string>()
  for (const s of items) {
    if (!(s.key in drafts)) continue
    const r = fromDraft(s, drafts[s.key]!)
    if ('error' in r) {
      errors.set(s.key, r.error)
      continue
    }
    const saved = fromDraft(s, toDraft(s))
    if (!same(r.value, 'value' in saved ? saved.value : s.value)) changes[s.key] = r.value
  }
  return { changes, errors }
}

/** A value as one line of text (the env default, a setting's current value). */
export function showValue(s: Pick<RuntimeSetting, 'type'>, v: SettingValue | null | undefined): string {
  if (v == null) return '—'
  switch (s.type) {
    case 'bool': return v ? 'on' : 'off'
    case 'list': return Array.isArray(v) && v.length ? v.join(', ') : 'none'
    case 'steps': {
      const parts = Object.entries(v as Record<string, string[]>).filter(([, x]) => x.length)
      return parts.length ? parts.map(([k, x]) => `${k}: ${x.join(', ')}`).join('; ') : 'none'
    }
    case 'text': return v === '' ? '(empty)' : String(v)
    default: return String(v)
  }
}

/** "split_duration" → "Split duration". */
export const settingLabel = (key: string) => key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')
