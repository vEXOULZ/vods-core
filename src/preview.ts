// Seek-bar previews: which tile of an upload's preview sheets shows a moment of it. The archive makes the sheets
// (`GET /v1/previews/<youtube id>/<sheet>.jpg`); map VOD time to an upload and offset first (`Timeline.locate`).
import type { Upload } from './types'

export interface PreviewFrame {
  /** The sheet image. */
  url: string
  /** The tile's top-left corner on the sheet, in pixels. */
  x: number
  y: number
  /** Tile size. */
  w: number
  h: number
  /** Sheet size, for `background-size` when the tile is drawn at another size. */
  sheetW: number
  sheetH: number
}

/**
 * The preview tile nearest `offset` seconds into `upload`, or null when it has no previews. `apiBase` is the archive
 * API's base (`ArchiveClient.apiBase`). Offsets past the end show the last frame.
 */
export function previewFrame(upload: Pick<Upload, 'id' | 'preview'>, offset: number, apiBase: string): PreviewFrame | null {
  const p = upload.preview
  if (!p || !Number.isFinite(offset)) return null
  const i = Math.min(p.count - 1, Math.max(0, Math.round(offset / p.interval)))
  const perSheet = p.cols * p.rows
  const sheet = Math.floor(i / perSheet)
  const tile = i % perSheet
  return {
    url: `${apiBase.replace(/\/+$/, '')}/v1/previews/${encodeURIComponent(upload.id)}/${sheet}.jpg`,
    x: (tile % p.cols) * p.w,
    y: Math.floor(tile / p.cols) * p.h,
    w: p.w,
    h: p.h,
    sheetW: p.cols * p.w,
    sheetH: p.rows * p.h,
  }
}
