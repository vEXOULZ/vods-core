// What the archive has of a VOD, as the admin pages' status chips say it: "archived" once it has YouTube parts,
// "details only" with just its row, "not in the archive" (Find on Twitch), and a chip per queued, running or paused
// job ("archive paused"). The words and tones are shared; each site draws the chips.

export type StatusTone = 'default' | 'ok' | 'warn' | 'accent'

export interface StatusChip {
  tone: StatusTone
  text: string
  /** The tooltip. */
  title: string
}

/** `inArchive` false: Twitch has it and the archive has nothing (Find on Twitch's list). */
export function uploadStatus(uploaded: boolean, inArchive = true): StatusChip {
  if (uploaded) return { tone: 'ok', text: 'archived', title: 'On YouTube' }
  if (inArchive) return { tone: 'warn', text: 'details only', title: 'The archive has its details, but nothing uploaded' }
  return { tone: 'default', text: 'not in the archive', title: 'Only on Twitch' }
}

export function jobStatus(job: { id: number; kind: string; state: string; step: string | null }): StatusChip {
  return {
    tone: job.state === 'paused' ? 'warn' : 'accent',
    text: `${job.kind} ${job.state}`,
    title: `Job ${job.id}, ${job.step ? `at ${job.step}` : 'at its end'}`,
  }
}
