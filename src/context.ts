import type { PageProps, MaybePromise } from './types.js'

// ---------------------------------------------------------------------------
// Internal per-request state — NOT exported publicly.
// Used by facade.ts and middleware.ts only.
// ---------------------------------------------------------------------------

export interface InertiaRequestState {
  /** Props shared for the current request via facade.share(). */
  sharedProps: Array<PageProps | ((request: Request) => MaybePromise<PageProps>)>
  /**
   * Whether the current request was issued with `Purpose: prefetch`.
   * When true, side-effects (e.g. analytics, flash consumption) should be
   * skipped because the browser may never actually navigate to the page.
   */
  isPrefetch: boolean
}

// Re-export the facade type so context.ts is the single import for
// Elysia-specific concerns.
export type { InertiaFacade } from './types.js'
