// Day-level dates for the list page: "today", "3 days ago".

const DAY = 86_400_000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
/** "today", "yesterday", "3 days ago", "2 weeks ago", then the date. */
export function relativeDay(when: Date, now = new Date()): string {
  const days = Math.round((startOfDay(now).getTime() - startOfDay(when).getTime()) / DAY)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
