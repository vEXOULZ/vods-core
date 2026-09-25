// Refreshes tests/fixtures from the public archive API: `npm run fixtures [-- <apiBase>]`.
// The VODs are picked for the time math: plain multi-part, one cut, several cuts, and a tiny 3-second cut.
import { mkdir, writeFile } from 'node:fs/promises'

const API = (process.argv[2] ?? process.env.VODS_API_BASE ?? 'https://vods.vexoulz.net/backend').replace(/\/+$/, '')
const VODS = {
  'vod-plain': '2703890458', // 3 parts, no cuts
  'vod-one-cut': '2510563806', // 8 parts, one 5 h cut
  'vod-two-cuts': '2466813018', // 7 parts, a 5.4 h cut and a 3 s cut
  'vod-late-cut': '2279668961', // 8 parts, cuts in the middle and near the end
}

async function get(path) {
  const res = await fetch(`${API}${path}`)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.json()
}

await mkdir(new URL('../tests/fixtures/', import.meta.url), { recursive: true })
for (const [name, id] of Object.entries(VODS)) {
  const vod = await get(`/vods/${id}`)
  await writeFile(new URL(`../tests/fixtures/${name}.json`, import.meta.url), JSON.stringify(vod, null, 2) + '\n')
  console.log(`${name}: ${id}`)
}
const page = await get(`/v1/vods/${VODS['vod-plain']}/comments?content_offset_seconds=0`)
// Chatters' names don't need to live in git: same name → same placeholder, so per-user behaviour stays testable.
const names = new Map()
for (const c of page.comments) {
  if (!names.has(c.display_name)) names.set(c.display_name, `viewer${names.size + 1}`)
  c.display_name = names.get(c.display_name)
}
await writeFile(new URL('../tests/fixtures/comments-plain-0.json', import.meta.url), JSON.stringify(page, null, 2) + '\n')
console.log(`comments: ${page.comments.length}, cursor: ${page.cursor ? 'yes' : 'no'}`)
