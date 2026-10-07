# Admin API contract (what `/manage` on this site expects)

The admin pages talk to twitch-archive's **worker admin API** (the existing `/admin/*` routes), reached from the
browser at `<adminBase>` — by default `/backend-admin` on the site's own origin, the same way the public archive API
is at `/backend`. So `GET /admin/jobs` on the worker is `GET /backend-admin/admin/jobs` from the site. How that path
is routed to the worker is hosting, not part of this repo.

Conventions (as the worker does today): JSON bodies; errors are `{"error": true, "msg": "..."}` with a 4xx/5xx
status; action responses are `{"error": false, "msg": "...", "jobId"?: n}`; job objects are the worker's `_job_json`
shape. Times are ISO 8601 UTC.

All of it but §6 (site tags, requested) is implemented in twitch-archive (worker admin API, from PR #12); the "new" labels below record what
that PR added. Differences from the first draft: a missing or expired session is `403` (not `401`), and audit
entries also carry `id` (the `before` cursor). The dev mock (`dev/adminMock.ts`) follows the same contract.

## 1. Password sessions — new

The existing `Authorization: Bearer <admin api key>` keeps working for scripts. In addition:

| Request | Response |
|---|---|
| `GET /admin/session` (no auth) | `200 {"authenticated": bool, "csrf": string \| null, "expiresAt": string \| null, "passwordLogin": bool, "twitchLogin": bool, "user": {...} \| null}` (1b) |
| `POST /admin/session` `{"password": "..."}` | `200` same shape + `Set-Cookie`; `401` wrong password; `429` with `Retry-After` when rate-limited; `404` when no password is configured (`passwordLogin: false`); `403` from outside `ARCHIVE_ADMIN_PASSWORD_NETWORKS` |
| `DELETE /admin/session` (needs CSRF) | `204`, cookie cleared |

- Password from a new setting (e.g. `ARCHIVE_ADMIN_PASSWORD`), hashed with scrypt at startup and compared in constant
  time (same approach as doomtp-bot's `webui/auth.py`). No password configured → password login is off.
- Cookie `archive_admin`: random token, `HttpOnly; Secure; SameSite=Strict; Path=/`, 8 h lifetime. Sessions are kept
  in the archive's database (twitch-archive PR #29), so a worker restart keeps admins signed in.
- Every `/admin/*` route accepts **either** the Bearer key **or** a valid session cookie. With the cookie, any
  non-GET request must send `X-CSRF-Token: <csrf>`; mismatch → `403`.
- Rate-limit failed logins (e.g. 5 per 5 minutes per client address). If the client address comes from a forwarded
  header, only trust it from a configured proxy address (setting, no default addresses in the repo).
- `GET /admin/refreshtoken` stays as it is (Google's redirect target, proven by its signed `state`).

### 1b. Twitch sign-in through vexoulz-auth (twitch-archive PR #22)

- The password only works from `ARCHIVE_ADMIN_PASSWORD_NETWORKS` (the local networks by default); `passwordLogin` in
  `GET /admin/session` says whether it is offered to the caller's address.
- `GET /admin/session` also returns `twitchLogin: bool` (vexoulz-auth is configured) and `user` (the Twitch
  `{id, login, displayName, avatar, color}`, null for a password session).
- `GET /admin/signin?next=/manage/...` → vexoulz-auth → `GET /admin/signin/callback`, which sets the same `archive_admin`
  cookie and redirects to `next`. Only `ARCHIVE_ADMIN_TWITCH_IDS` get a session. On failure it redirects to
  `/admin/login?auth_error=<denied|expired|twitch|not_allowed|unavailable|misconfigured>&next=...`.
- Audit entries from a Twitch session record the actor as `twitch:<id>`, and carry `actorLogin` (the Twitch login;
  null for the password, the API key and older entries).
- The site keeps `/admin/login` working as a redirect to `/manage/login`, since that's where the worker sends errors.

### 1c. The quiet check (twitch-archive PR #29)

- `GET /admin/signin?quiet=1&next=/...` works the same, except that the callback never shows an error: it always goes
  back to `next` with `admin=1` (a session was made) or `admin=0` (not on the list, denied, unavailable, anything).
- The site only sends someone already signed in to the account, so vexoulz-auth answers at once and nobody sees
  Twitch. It remembers the answer per browser and Twitch account (`src/app/admin/quiet.ts`).

## 2. Health — new

`GET /admin/health` →

```json
{
  "worker": { "ok": true, "runningJobs": 1, "startedAt": "..." },
  "api": { "ok": true },
  "youtube": { "authorized": true, "valid": true, "error": null, "checkedAt": "..." },
  "live": { "live": false, "streamId": null, "startedAt": null },
  "jobs": { "counts": { "queued": 0, "running": 1, "paused": 0, "done": 120, "failed": 2, "cancelled": 3 },
            "recentFailures": [ /* up to 5 job objects, newest first */ ] }
}
```

`youtube` may be cached (the real check refreshes a Google token; e.g. re-check at most every 10 minutes, and
`POST /admin/youtube/status` or `GET /admin/youtube/status` forces one — that route **exists**).

## 3. Jobs — mostly exists

- `GET /admin/kinds` — exists.
- `GET /admin/jobs?state=&vodId=&kind=&limit=` — exists. **New:** `before=<job id>` for paging older jobs.
- `GET /admin/jobs/{id}` — exists.
- `POST /admin/jobs` `{kind, vodId?, payload?, fromStep?, pauseBefore?, paused?}` — exists.
- `POST /admin/jobs/{id}/pause | resume {once?} | retry | cancel` — exist.
- **New:** `PATCH /admin/jobs/{id}` `{"pauseBefore": [steps] | null, "pauseNext": bool}` → job object.
- **New:** job events. The worker's per-job log lines (`ctx.log`) and step changes, stored per job (capped, e.g. the
  last 1000):
  `GET /admin/jobs/{id}/events?after=<seq>&limit=` →
  `{"data": [{"seq": 1, "at": "...", "level": "info|warning|error", "step": "upload", "message": "...",
  "progress": {"done": 3, "total": 10, "unit": "parts|bytes|percent"} | null}], "next": <seq>}`.
  Progress where a step knows it (capture, split, upload). Polling is enough for the MVP; an SSE stream is a later
  nicety.

## 4. VODs — new (the existing `/admin/delete`, `/admin/chapters`, `/admin/emotes`, ... stay)

- `GET /admin/vods/{id}` → the full VOD row as the public API serializes it, plus
  `{"chaptersLocked": bool, "botChat": {...} | null, "jobs": [recent job objects for this VOD]}`. `botChat` is what
  the last `bot_chat` job read from doomtp-bot's log: `fetched_at`, `since`/`until`, `keyed` (read with a key, so
  removals are in), `rows`, and `coverage.gaps` (`[{from, to, reason}]`, ms since the epoch); null before one ran
  (twitch-archive PR #26).
- `GET /admin/vods?q=&hidden=&limit=&before=` → `{"data": [{id, title, createdAt, duration, duration_seconds,
  thumbnail_url, stream_id, hidden, merged_into}], "next": <cursor> | null}`, newest first, hidden and merged VODs
  included. `q` matches the title, or is a VOD id; `hidden=true|false` filters; `before` is the last page's `next`
  (twitch-archive PR #30). The Manage VODs page uses it instead of the public list, which leaves hidden VODs out.
- `PATCH /admin/vods/{id}` `{"title"?, "hidden"?, "thumbnailUrl"?: http(s) URL | null, "duration"?: "HH:MM:SS",
  "createdAt"?: ISO}` → the updated VOD (with `hidden`). `thumbnailUrl: null` falls back to the first YouTube part's.
  The duration can't end before the last chapter or games row. A merged VOD refuses everything but `hidden` (409).
  Audited with before and after (twitch-archive PR #30).
- Hidden VODs are gone from the public API as if missing: not in `/vods` or `/games`, 404 on `/vods/{id}` and its
  comments, left out of games-played and `/v1/status`'s latest VOD.
- `GET /admin/vods/{id}/games` → the VOD's games rows `[{start_time, end_time, game_id, game_name, chapter_image,
  title?, thumbnail_url?, video_provider?, video_id?}]`; `PUT` with `{"games": [...]}` replaces them. Validated:
  sorted by start, no overlaps, inside the duration, `game_name` required. These are what the games pages list, not
  the chapters; the editor can start them from the chapters.
- `PUT /admin/vods/{id}/chapters` `{"chapters": [{"name", "gameId", "imageTemplate"?, "start", "length",
  "restricted", "kind"?}], "locked": bool}` → the updated VOD. `kind: "gap"` keeps a merge's gap chapter one. Validate: sorted by start, no overlaps, inside the VOD's
  duration, lengths > 0. Store `image` too (template with a small size filled in) so old readers keep working.
  `locked: true` makes the automatic `chapters` step skip this VOD unless its payload has `"force": true`.
- `PUT /admin/vods/{id}/youtube` `{"youtube": [{"id", "type": "vod|live", "part", "duration"?}]}` and
  `PUT /admin/vods/{id}/drive` `{"drive": [{"id", "type"}]}` → the updated VOD.
- `GET /admin/twitch/games?query=` → `[{"gameId", "name", "imageTemplate"}]` (Helix category search), for the
  chapter editor.
- `GET /admin/vods/{id}/emotes` → the saved emote row (or `null`).
- `POST /admin/bot-chat` `{"vodId"}` → starts a `bot_chat` job: reads the VOD's chat from doomtp-bot's `/log` into
  `bot_logs` (adds or updates rows only). 409 while one runs for that VOD or when the VOD was merged or split; 500 when
  the archive has no doomtp URL set. `POST /admin/bot-chat/backfill` `{"vodIds"?}` → a `bot_chat_backfill` job for
  every VOD without bot chat (or only those), skipping merged or split ones (twitch-archive PR #24).
- After any VOD edit, the public API must serve the change right away (invalidate its cached responses for that VOD,
  and lists that include it).

## 4b. Merging and splitting VODs (twitch-archive PR #16)

For one broadcast that Twitch cut in two (merge), or two streams in one VOD (split). Nothing is re-uploaded; rows
(chapters, parts, chat, games, emotes) move in one transaction, and every splice can be undone, latest first.

- `GET /admin/vods/{id}` also has `splices: [{id, kind: "merge"|"split", vodId, otherId, offset, gap, detail,
  createdAt, undoneAt, undoable}]`, and `merged_into: {id, offset}` on a VOD merged into another one.
- `GET /admin/vods/{id}/merge-candidates` → `{vod: {..., endsAt, mergedInto}, withinMinutes, candidates: [{id,
  streamId, title, createdAt, duration, gap, overlaps, titlesMatch}]}`.
- `POST /admin/vods/{id}/merge` `{"source", "gap"?}`, `POST /admin/vods/{id}/unmerge` `{"source", "force"?}`,
  `POST /admin/vods/{id}/split` `{"at", "force"?}`, `POST /admin/vods/{id}/unsplit` `{"source"?, "force"?}` →
  `{"error": false, "msg", "splice", "vod", "warnings"?, "newVodId"?, "undid"?: "merge"}`.
- 409s carry extra fields next to `msg`: a split inside an upload has `validPoints: [{at, from, to}]` (nearest
  first); an undo that would lose edits made since has `edited: ["<vodId>.<field>", ...]` and works with `force`.
- Twitch re-fetches (`/admin/chapters`, `/admin/emotes`, `/admin/logs`, `/admin/duration`, `/admin/download`,
  `/admin/reupload`, `/admin/delete`, …) answer 409 for a merged or split VOD. `/admin/youtube/parts` still works;
  the page asks to run it after a merge or split, since the descriptions list the old parts.

## 4c. Runtime settings (twitch-archive PR #31)

- `GET /admin/settings` → `{"data": [{key, value, default, overridden, type: "bool"|"int"|"float"|"text"|"list"|
  "steps", group: "Capture"|"YouTube"|"Pipeline"|"Runner", applies: "now"|"next job", help, min, max, updatedAt,
  updatedBy, choices?}]}`. `default` is the worker's env value; `choices` (for `steps`) lists each job kind's steps.
- `PATCH /admin/settings` `{key: value, ...}` → the same list; all or nothing (400 names the refused key).
- `DELETE /admin/settings/{key}` → the same list, with that key back to its env default.
- Secrets, URLs, paths, the channel and DB settings are never listed. All three are audited with before and after.

## 4d. Storage (twitch-archive PR #32)

- `GET /admin/storage?refresh=` → `{"disk": {total, used, free} | null, "folders": [{area: "vods"|"live", name,
  path, bytes, files, modifiedAt, vod: {id, title, hidden} | null, jobs: {active: [job], last: job | null}, stale}],
  "cacheSeconds": 30}`. Paths are relative (`vods/123`). `stale`: no job for it is queued, running or paused, and it
  has no VOD or its last job failed or was cancelled. The scan is cached; `refresh=true` rescans.
- `DELETE /admin/storage/{area}/{name}` → `{path, bytes, files}` freed. 409 while a job for it is active, 404 for an
  unknown folder, 400 for a bad name. Audited with the bytes freed.

## 5. Audit log — new

Every state-changing admin request is recorded: `{at, actor: "password" | "api-key", action, target, detail}`.
`GET /admin/audit?before=&limit=` → `{"data": [...]}`.

`/manage/audit` now reads `GET /api/v2/audit?cursor=&limit=` instead → `{"items": [...], "next_cursor"}` (vex-platform's
shape: `actor_kind`, `actor_id`, `actor_login`, `via`, dotted `action`s, `outcome`, `before`/`after`/`detail`, ISO `at`).
It lists every actor, the worker's own jobs and refused requests too, where `/admin/audit` lists admins only. Same
session cookie; errors there are problem details (`detail` is the message).

## 6. Site tags — in twitch-archive; the text and pattern fields are requested

How each VOD tag shows on the site, edited on `/manage/tags`. Until the archive has these routes the site uses the
built-in `site.tags` (`createVodsApp()`'s `site.tags`, or `DEFAULT_TAGS`) (the public GET answering 404 or failing means "none saved"), and
`/manage/tags` shows those read-only. The dev mock implements all of it (`MOCK_SITE_TAGS=no` makes it answer 404).

A tag: `{name, label, drawn, color, shape, width, height, text, textColor, textSize, textX, textY, textRotate,
pattern, patternColor, patternSize}`. The text and pattern fields are newer than the rest: until the archive keeps them, it may
leave them out (the site reads them as `null`).

- `name`: the VOD tag it styles, `^[a-z0-9][a-z0-9-]{0,31}$`, unique. `new` and `updated` come from the dates;
  any other name matches a synthetic VOD's own tag (`complete`, `compilation`, …). `new`, `updated` and
  `compilation` are **auto tags** (set by the site or the archive, not by an admin): every saved list must keep them,
  though they can be restyled. Any other tag (`complete` included) can be added and removed freely.
- `label`: 1–40 characters, shown on the chip or read out when drawn.
- `drawn`: `true` hangs it off the thumbnail; `false` keeps it a chip by the date.
- `color`: `null`, or at most 160 characters made only of letters, digits, spaces and `#.,%/()*+-`, that is one of:
  a hex (`#rgb` to `#rrggbbaa`); a color name (3–20 letters); `var(--vx-…)` (`--vx-` then `[a-z0-9-]+`); or one
  color function (`rgb rgba hsl hsla hwb lab lch oklab oklch color color-mix`) around the whole value. Inside it may
  be `var(--vx-…)`, other color functions and `calc min max clamp`, nested at most 4 deep, and no other function.
  `var()` with anything but one `--vx-` name, and `--` anywhere else, are refused. So relative colors and mixes work:
  `oklch(from var(--vx-accent) calc(l - 0.15) c h)`, `color-mix(in oklch, var(--vx-ok) 60%, white)`. The rule keeps
  out `url()` and anything else that could load or run something. The site checks it again before using it in CSS
  (`isTagColor` in `src/app/lib/vodTags.ts`).
- `shape`: `null` (a placeholder is drawn) or the uploaded SVG's path relative to the public API,
  `v1/site/tags/{name}.svg?v=<content hash>`. Read-only here: set by the shape routes below.
- `width`, `height`: `null` or a whole number of px, 8–200.
- `text`: `null` or 1–24 characters written on the drawn tag (trimmed). Not the label: the label stays as it is.
- `textColor`: `null` (the page background) or a color, as `color`.
- `textSize`: `null` (half the tag's height) or a whole number of px, 6–48.
- `textX`, `textY`: `null` or a whole number of px, −100 to 100, nudging the text from the middle (+ is right, down).
- `textRotate`: `null` or a whole number of degrees, −180 to 180, turning the text clockwise.
  With `text` `null` the other five are `null` too (the archive may store them as sent or drop them).
- `pattern`: `null` (plain), `"stripes"` (diagonal) or `"checks"`, over the parts drawn in the tag's color.
- `patternColor`: `null` (the page background) or a color, as `color`: the pattern's second color.
- `patternSize`: `null` (4) or a whole number of px, 2–40: one stripe's or square's width.
  With `pattern` `null` the other two are `null` too.

Public (the archive API at `/backend`, no session, cacheable for a minute or so):

- `GET /v1/site/tags` → `{"tags": [tag, ...]}` in display order; 404 (or `{"tags": null}`) while none were ever saved.
- `GET /v1/site/tags/{name}.svg` → the sanitized SVG, `content-type: image/svg+xml`,
  `content-security-policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`,
  `x-content-type-options: nosniff`, and (since the URL carries `?v=<hash>`) `cache-control: public, max-age=31536000,
  immutable`. 404 if the tag has no shape.

Admin (session + CSRF as everywhere else; every change audited with before and after):

- `GET /admin/site/tags` → `{"tags": [tag, ...], "updatedAt", "updatedBy"}`; 404 while the feature isn't deployed
  (the page then shows the built-in tags read-only). Never saved → `{"tags": [], "updatedAt": null, ...}` is fine too.
- `PUT /admin/site/tags` `{"tags": [{name, label, drawn, color, width, height, text, textColor, textSize, textX, textY, textRotate, pattern, patternColor, patternSize}, ...]}` → the same as the GET. Replaces
  the whole list, in order, all or nothing: at most 32 tags, and all three auto tags present; a 400 `{error, msg}`
  names the first refused tag and field (or the missing auto tag). `shape` in the body is ignored (shapes stay with their tag's name); a tag no longer listed loses its shape.
- `PUT /admin/site/tags/{name}/shape` with the raw SVG as the body, `content-type: image/svg+xml` → the same as the
  GET. 404 for a tag not in the saved list, 415 for another content type, 413 over 64 KB, 400 if the SVG isn't safe.
  The archive must **parse** the SVG (not pattern-match it) and keep an allow-list of elements and attributes:
  no `<script>`, `on*` handlers, `<foreignObject>`, `<iframe>`, `<image>`/embedded rasters, DOCTYPE or entities,
  `href`/`xlink:href` other than `#fragment`, `url()` other than `url(#…)`, or `@import`. Store the cleaned file and
  set `shape` to its versioned path.
- `DELETE /admin/site/tags/{name}/shape` → the same as the GET, with that tag's `shape` back to `null`.

The site draws the SVG in its own colors, except the parts meant to follow the tag: those drawn in `currentColor`,
or, in an SVG that never uses `currentColor`, the black ones (`#000`, `black`, `rgb(0,0,0)`, or no fill at all) take
the tag's color (or its pattern: fills and strokes only). The archive's cleaning must keep `currentColor` and the file's other colors as they are.
