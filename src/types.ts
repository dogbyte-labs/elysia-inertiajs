import type { Context } from 'elysia'

export type {
  PropWrapperType,
  PropWrapper,
  DeferredProp,
  MergeProp,
  DeepMergeProp,
  OptionalProp,
  AlwaysProp,
  OnceProp,
} from './props.js'

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

export type MaybePromise<T> = T | Promise<T>

export type PageProps = Record<string, unknown>

export type ErrorBag = Record<string, string | string[]>

// ---------------------------------------------------------------------------
// Core page object
// ---------------------------------------------------------------------------

export interface InertiaPage<Props extends PageProps = PageProps> {
  component: string
  props: Props & { errors: ErrorBag }
  url: string
  version: string | null
  clearHistory?: boolean
  encryptHistory?: boolean
  preserveFragment?: boolean
  preserveScroll?: boolean
  // v3 additions
  /** Deferred prop groups: group name → array of prop keys */
  deferredProps?: Record<string, string[]>
  /** Keys whose values should be shallow-merged on the client */
  mergeProps?: string[]
  /** Keys whose values should be deep-merged on the client */
  deepMergeProps?: string[]
  /** Keys that originated from global or per-request shared props */
  sharedProps?: string[]
}

// ---------------------------------------------------------------------------
// render() call options
// ---------------------------------------------------------------------------

export interface RenderOptions {
  status?: number
  headers?: HeadersInit
  clearHistory?: boolean
  encryptHistory?: boolean
  preserveFragment?: boolean
  preserveScroll?: boolean
}

// ---------------------------------------------------------------------------
// SSR types
// ---------------------------------------------------------------------------

export interface SsrResult {
  body: string
  head?: string[]
}

export type SsrRenderer = (input: {
  page: InertiaPage
  c: Context
}) => MaybePromise<SsrResult | null>

// ---------------------------------------------------------------------------
// Document renderer
// ---------------------------------------------------------------------------

export interface DocumentRenderer {
  (input: {
    page: InertiaPage
    c: Context
    ssr: SsrResult | null
  }): MaybePromise<string | Response>
}

// ---------------------------------------------------------------------------
// OnceStore — tracks which `once()` prop keys have already been delivered
// ---------------------------------------------------------------------------

/**
 * Pluggable store that tracks which `once()` prop keys have already been
 * delivered to the client.  The default implementation is an in-memory Map.
 * For multi-process or multi-server deployments you can supply a Redis-backed
 * (or any other) implementation by passing `onceStore` to `inertia()`.
 */
export interface OnceStore {
  has(key: string): boolean | Promise<boolean>
  set(key: string): void | Promise<void>
  delete(key: string): void | Promise<void>
}

// ---------------------------------------------------------------------------
// Middleware options
// ---------------------------------------------------------------------------

export interface InertiaOptions<Shared extends PageProps = PageProps> {
  document: DocumentRenderer
  share?: (c: Context) => MaybePromise<Shared>
  version?: string | ((c: Context) => MaybePromise<string | null>)
  resolveErrors?: (c: Context) => MaybePromise<ErrorBag>
  ssr?: false | SsrRenderer
  /**
   * Custom store for tracking delivered `once()` props.
   * Defaults to a module-level in-memory Map (suitable for single-process use).
   */
  onceStore?: OnceStore
}

// ---------------------------------------------------------------------------
// Per-request facade exposed via store.inertia
// ---------------------------------------------------------------------------

export interface InertiaFacade {
  render<Props extends PageProps>(
    component: string,
    props?: Props,
    options?: RenderOptions,
  ): Promise<Response>
  share(props: PageProps | ((c: Context) => MaybePromise<PageProps>)): void
  location(url: string): Response
  redirect(url: string): Response
  isInertiaRequest(): boolean
  /**
   * Returns `true` when the request was sent with the `Purpose: prefetch`
   * header, indicating the browser may pre-load the response without the user
   * having navigated yet.
   */
  isPrefetch(): boolean
}
