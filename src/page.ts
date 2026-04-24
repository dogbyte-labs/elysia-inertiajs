import type { InertiaPage, PageProps, ErrorBag, OnceStore } from './types.js'
import { parseInertiaHeaders, filterPartialProps, normalizeUrl } from './protocol.js'
import { isPropWrapper, type PropWrapper } from './props.js'

// ---------------------------------------------------------------------------
// Default in-memory OnceStore
// ---------------------------------------------------------------------------

/**
 * Creates a fresh in-memory OnceStore.
 * Tests should create a new instance per test to avoid state leakage.
 */
export function createInMemoryOnceStore(): OnceStore {
  const delivered = new Map<string, true>()
  return {
    has: (key: string) => delivered.has(key),
    set: (key: string) => { delivered.set(key, true) },
    delete: (key: string) => { delivered.delete(key) },
  }
}

/** Module-level singleton used when no `onceStore` is provided in options. */
export const defaultOnceStore: OnceStore = createInMemoryOnceStore()

// ---------------------------------------------------------------------------
// assemblePageObject params
// ---------------------------------------------------------------------------

export interface AssemblePageParams {
  /** The component name being rendered (e.g. "Dashboard/Index"). */
  component: string
  /** Props passed directly to render(). */
  routeProps: PageProps
  /** Globally-shared props from InertiaOptions.share. */
  globalSharedProps: PageProps
  /** Per-request shared props from facade.share() calls. */
  requestSharedProps: PageProps
  /** Error bag resolved for this request. */
  errors: ErrorBag
  /** The current asset version (or null). */
  version: string | null
  /** The request object (used for URL + partial-reload headers). */
  request: Request
  /** Optional render-level flags. */
  clearHistory?: boolean
  encryptHistory?: boolean
  preserveFragment?: boolean
  preserveScroll?: boolean
  /**
   * Store used to track which `once()` prop keys have already been delivered.
   * Defaults to the module-level in-memory store.
   */
  onceStore?: OnceStore
  /**
   * Keys from the `X-Inertia-Reset` header — these once-keys are cleared
   * so the prop is re-delivered on this request.
   */
  resetKeys?: string[]
}

// ---------------------------------------------------------------------------
// Resolver helpers
// ---------------------------------------------------------------------------

async function resolveValue(
  value: unknown,
  resolveDeferredFn?: boolean,
  onceStore?: OnceStore,
  resetKeys?: Set<string>,
): Promise<unknown> {
  if (!isPropWrapper(value)) {
    return typeof value === 'function' ? await (value as () => unknown)() : value
  }
  const wrapper = value as PropWrapper
  switch (wrapper._type) {
    case 'defer':
      if (resolveDeferredFn) return await wrapper.fn()
      return undefined
    case 'merge':
      return wrapper.value
    case 'deepMerge':
      return wrapper.value
    case 'optional':
      return await wrapper.fn()
    case 'always':
      return typeof wrapper.fn === 'function'
        ? await (wrapper.fn as () => unknown)()
        : wrapper.fn
    case 'once': {
      const store = onceStore ?? defaultOnceStore
      const { key, fn } = wrapper
      if (resetKeys?.has(key)) {
        await store.delete(key)
      }
      if (await store.has(key)) {
        return null
      }
      const resolved = await fn()
      await store.set(key)
      return resolved
    }
  }
}

// ---------------------------------------------------------------------------
// Page assembly
// ---------------------------------------------------------------------------

/**
 * Merge all prop sources, classify prop wrappers, apply partial-reload
 * filtering, and produce the canonical InertiaPage object.
 *
 * Merge order (later entries win on key collision):
 *   globalSharedProps → requestSharedProps → { errors } → routeProps
 */
export async function assemblePageObject(params: AssemblePageParams): Promise<InertiaPage> {
  const {
    component,
    routeProps,
    globalSharedProps,
    requestSharedProps,
    errors,
    version,
    request,
    clearHistory,
    encryptHistory,
    preserveFragment,
    preserveScroll,
    onceStore,
    resetKeys: resetKeysArray,
  } = params

  const resetKeys = new Set(resetKeysArray ?? [])

  const sharedKeys = new Set<string>([
    ...Object.keys(globalSharedProps),
    ...Object.keys(requestSharedProps),
  ])

  const mergedProps: PageProps = {
    ...globalSharedProps,
    ...requestSharedProps,
    errors,
    ...routeProps,
  }

  const { partialComponent, partialData, partialExcept } = parseInertiaHeaders(request)

  const isPartialReload =
    partialComponent !== null &&
    partialComponent === component &&
    (partialData.length > 0 || partialExcept.length > 0)

  const deferredProps: Record<string, string[]> = {}
  const mergeProps: string[] = []
  const deepMergeProps: string[] = []
  const sharedProps: string[] = []
  const alwaysKeys = new Set<string>()

  for (const [key, value] of Object.entries(mergedProps)) {
    if (sharedKeys.has(key)) {
      sharedProps.push(key)
    }

    if (!isPropWrapper(value)) continue

    const wrapper = value as PropWrapper
    if (wrapper._type === 'defer') {
      const group = wrapper.group ?? 'default'
      if (!deferredProps[group]) deferredProps[group] = []
      deferredProps[group].push(key)
    } else if (wrapper._type === 'merge') {
      mergeProps.push(key)
    } else if (wrapper._type === 'deepMerge') {
      deepMergeProps.push(key)
    } else if (wrapper._type === 'always') {
      alwaysKeys.add(key)
    }
  }

  let includedKeys: string[]

  const allDeferredKeys = new Set(Object.values(deferredProps).flat())

  if (isPartialReload) {
    const filtered = filterPartialProps(mergedProps, partialData, partialExcept)
    const filteredKeySet = new Set(Object.keys(filtered))
    for (const key of alwaysKeys) {
      filteredKeySet.add(key)
    }
    const partialDataSet = new Set(partialData)
    for (const key of allDeferredKeys) {
      if (partialDataSet.has(key)) {
        filteredKeySet.add(key)
      } else {
        filteredKeySet.delete(key)
      }
    }
    includedKeys = [...filteredKeySet]
  } else {
    includedKeys = Object.keys(mergedProps).filter((k) => !allDeferredKeys.has(k))
  }

  const resolvedProps: PageProps = {}
  const partialDataSet = new Set(partialData)
  await Promise.all(
    includedKeys.map(async (key) => {
      const value = mergedProps[key]
      const resolveDeferred = allDeferredKeys.has(key) && partialDataSet.has(key)
      resolvedProps[key] = await resolveValue(value, resolveDeferred, onceStore, resetKeys)
    }),
  )

  const page: InertiaPage = {
    component,
    props: resolvedProps as InertiaPage['props'],
    url: normalizeUrl(request),
    version,
  }

  if (clearHistory !== undefined) page.clearHistory = clearHistory
  if (encryptHistory !== undefined) page.encryptHistory = encryptHistory
  if (preserveFragment !== undefined) page.preserveFragment = preserveFragment
  if (preserveScroll !== undefined) page.preserveScroll = preserveScroll

  if (Object.keys(deferredProps).length > 0) page.deferredProps = deferredProps
  if (mergeProps.length > 0) page.mergeProps = mergeProps
  if (deepMergeProps.length > 0) page.deepMergeProps = deepMergeProps
  if (sharedProps.length > 0) page.sharedProps = sharedProps

  return page
}
