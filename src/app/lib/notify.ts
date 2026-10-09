// How the pages' logic tells the viewer something short ("Link copied"): the site shows it its own way (the app with
// vexoulz-ui's toasts).

/** Show a short message; `kind` defaults to a plain confirmation, `duration` is in ms. */
export type Notify = (message: string, options?: { kind?: 'ok' | 'info' | 'error'; duration?: number }) => void
