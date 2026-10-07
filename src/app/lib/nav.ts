import type { NavItem } from '@vexoulz/ui'
import { site } from '../site'

/** The header's links. */
export function nav(): NavItem[] {
  return [
    { label: 'VODs', to: '/vods' },
    { label: 'Playthroughs', to: '/playthroughs' },
    { label: 'Live', href: site.twitchUrl, external: true },
  ]
}
