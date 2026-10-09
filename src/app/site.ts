// The site the app is running as: which vexoul.net site it is, its name, its Twitch link, and how its VOD tags show.
// createVodsApp() fills these in before the app mounts; everything else reads them at the time it needs them.
import { defineVodsConfig, type VodsConfig } from '../config'

/** How a VOD tag shows (see `site.tags`). */
export interface TagStyle {
  /** What it reads as: on its chip, or to screen readers when drawn. */
  label: string
  /** Hangs off the thumbnail as a drawn tag; otherwise it's a chip by the date. */
  drawn: boolean
  /** Any CSS color: the drawn tag's paint, or the chip's text and border. Unset: the default look. */
  color?: string
  /** A drawn tag's vector image (a URL, e.g. `/tags/new.svg` from `public/`), in its own colors: the parts in
   * `currentColor` (or, in a file without currentColor, the black parts) take `color` (lib/tagShape). Null: a
   * placeholder until the image exists. */
  shape?: string | null
  /** A drawn tag's size in px. Default 62 × 22. */
  width?: number
  height?: number
  /** Text written on a drawn tag (not the label, which stays for chips and screen readers). Unset: none. */
  text?: string
  /** The text's color (any CSS color) and size in px. Unset: the page background's color, and half the height. */
  textColor?: string
  textSize?: number
  /** Moves the text from the tag's middle, in px (e.g. off a tag's hole). */
  textX?: number
  textY?: number
  /** Turns the text, in degrees, clockwise (−180 to 180). Unset: level with the tag. */
  textRotate?: number
  /** A pattern over the tag-colored parts: diagonal stripes or checks of `color` and `patternColor`. Unset: plain. */
  pattern?: 'stripes' | 'checks'
  /** The pattern's second color (any CSS color) and the width of one stripe or square in px. Unset: the page
   * background's color, and 4. */
  patternColor?: string
  patternSize?: number
}

/**
 * The built-in VOD tags: `new` and `updated` follow the VOD's dates (lib/vodTags.ts), the rest are set on the VOD. Their
 * colors are the site's `--vods-tag-new`, `--vods-tag-updated` and `--vods-tag-complete` (no fallback inside the var(),
 * which a tag color can't hold): the Deep Field app maps them to its `--vx-*` (styles/tags.css), a site with its own UI
 * defines them.
 */
export const DEFAULT_TAGS: Record<string, TagStyle> = {
    new: { label: 'new', drawn: true, color: 'var(--vods-tag-new)', shape: null },
    updated: { label: 'updated', drawn: true, color: 'var(--vods-tag-updated)', shape: null },
    complete: { label: 'complete', drawn: true, color: 'var(--vods-tag-complete)', shape: null },
    compilation: { label: 'playthrough', drawn: false },
  }

/** What tells one vods site from another. Everything else (the pages, the player, Manage) is the same. */
export interface VodsSite {
  /**
   * The site's id. For a site on vexoulz-ui (`createVodsApp()`), its entry in the network's `SITES`: its accent, sky,
   * switcher entry and repo links. A site with its own UI (the `kit` entry) uses any id.
   */
  id: string
  /** The site's name in page titles and on the sign-in page: its host, e.g. `vods.vexoul.net`. */
  name: string
  /** The channel's Twitch page (the nav's "Live" and the watch page's link). */
  twitchUrl: string
  /** VOD cards per page. */
  perPage: number
  /**
   * VOD tags, by name, until the archive has tags edited on /manage/tags. A tag not listed is a chip with its own
   * name.
   */
  tags: Record<string, TagStyle>
}

export const site: VodsSite = {
  id: 'vods',
  name: '',
  twitchUrl: '',
  perPage: 24,
  tags: DEFAULT_TAGS,
}

/** The channel config (`createVods`'s), for code outside components. A placeholder until createVodsApp() sets it. */
export let vodsConfig: VodsConfig = defineVodsConfig({ channel: '-', twitchId: '0', apiBase: '/backend', startDate: '1970-01-01' })

/** Sets the site and its channel config. createVodsApp() calls it; tests can too. */
export function configureSite(config: VodsConfig, s: Partial<VodsSite> & Pick<VodsSite, 'id' | 'name' | 'twitchUrl'>): void {
  vodsConfig = config
  Object.assign(site, { perPage: 24, tags: DEFAULT_TAGS }, s)
}
