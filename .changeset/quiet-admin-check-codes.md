---
"@vexoulz/vods-core": minor
---

The quiet admin check no longer leaves the page. `installVodsSession` mints a one-time code at vexoulz-auth
(`POST /v1/codes`, vexoulz-auth ≥ v0.3.0) and hands it to the worker (`POST /admin/session {code}`, twitch-archive
≥ v0.14.0), so an admin signed in to the account gets the dashboard session, and Manage, without a reload; a viewer,
someone signed out, or an answer it can't read shows nothing and isn't asked again until the next page load. Nothing
is kept in localStorage or sessionStorage, and the `?admin=` answer is gone from URLs. The archive's client id is a
new option, `adminClientId` on `createVodsApp()` and `installVodsSession()` (default `vods-admin`). New in the `kit`
entry: `quietAdminCheck`, `signInWithCode`, `ADMIN_CLIENT_ID`, `AdminCheck` and `AuthRequests`.

**Breaking (kit):** `answerOf`, `recall`, `remember`, `forget`, `shouldCheck`, the `Answer` type and `quietLoginUrl`
are removed. A site that wired the check itself calls `installVodsSession(router, account)` instead, and drops
`forget()` from its sign-out. The dev mock serves a fake vexoulz-auth at `/auth-mock` and the worker's code hand-off;
`MOCK_ADMIN_QUIET` is gone (sign in with `?as=viewer` or `MOCK_ACCOUNT=viewer` instead).
