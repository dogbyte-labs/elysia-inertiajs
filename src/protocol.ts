import type { PageProps } from './types.js'

// ---------------------------------------------------------------------------
// Header names
// ---------------------------------------------------------------------------

const HEADER_INERTIA = 'x-inertia'
const HEADER_VERSION = 'x-inertia-version'
const HEADER_PARTIAL_COMPONENT = 'x-inertia-partial-component'
const HEADER_PARTIAL_DATA = 'x-inertia-partial-data'
const HEADER_PARTIAL_EXCEPT = 'x-inertia-partial-except'
const HEADER_LOCATION = 'x-inertia-location'
const HEADER_RESET = 'x-inertia-reset'
const HEADER_PURPOSE = 'purpose'
export const HEADER_REDIRECT = 'x-inertia-redirect'
const HEADER_ERROR_BAG = 'x-inertia-error-bag'

// ---------------------------------------------------------------------------
// Parsed header bag
// ---------------------------------------------------------------------------

export interface InertiaHeaders {
  inertia: boolean
  version: string | null
  partialComponent: string | null
  partialData: string[]
  partialExcept: string[]
  reset: string[]
  prefetch: boolean
  errorBag: string | null
}

// ---------------------------------------------------------------------------
// Header parsing
// ---------------------------------------------------------------------------

export function parseInertiaHeaders(request: Request): InertiaHeaders {
  const headers = request.headers

  const inertia = headers.get(HEADER_INERTIA) === 'true'
  const version = headers.get(HEADER_VERSION)

  const partialComponent = headers.get(HEADER_PARTIAL_COMPONENT)

  const partialDataRaw = headers.get(HEADER_PARTIAL_DATA)
  const partialData = partialDataRaw
    ? partialDataRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  const partialExceptRaw = headers.get(HEADER_PARTIAL_EXCEPT)
  const partialExcept = partialExceptRaw
    ? partialExceptRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  const resetRaw = headers.get(HEADER_RESET)
  const reset = resetRaw
    ? resetRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  const prefetch = headers.get(HEADER_PURPOSE) === 'prefetch'

  const errorBag = headers.get(HEADER_ERROR_BAG)

  return { inertia, version, partialComponent, partialData, partialExcept, reset, prefetch, errorBag }
}

// ---------------------------------------------------------------------------
// Inertia request detection
// ---------------------------------------------------------------------------

export function isInertiaRequest(request: Request): boolean {
  return request.headers.get(HEADER_INERTIA) === 'true'
}

// ---------------------------------------------------------------------------
// Version mismatch detection
// Returns true when a mismatch requires a full reload (409).
// Only GET requests trigger version mismatches per the Inertia protocol.
// ---------------------------------------------------------------------------

export function checkVersionMismatch(
  request: Request,
  clientVersion: string | null,
  serverVersion: string | null,
): boolean {
  if (request.method !== 'GET') return false
  if (clientVersion === null || serverVersion === null) return false
  return clientVersion !== serverVersion
}

// ---------------------------------------------------------------------------
// Dot-path utilities
// ---------------------------------------------------------------------------

/**
 * Get a value at a dot-path from an object.
 */
export function getPath(obj: unknown, path: string): unknown {
  const segments = path.split('.')
  let current: unknown = obj
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/**
 * Check if a dot-path exists in an object.
 */
export function hasPath(obj: unknown, path: string): boolean {
  const segments = path.split('.')
  let current: unknown = obj
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return false
    if (!(segment in (current as Record<string, unknown>))) return false
    current = (current as Record<string, unknown>)[segment]
  }
  return true
}

/**
 * Set a value at a dot-path in an object (immutably returns a new object).
 */
export function setPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const segments = path.split('.')
  const result = { ...obj }
  let current: Record<string, unknown> = result
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]
    const existing = current[segment]
    const next =
      existing !== null && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {}
    current[segment] = next
    current = next
  }
  current[segments[segments.length - 1]] = value
  return result
}

/**
 * Remove a value at a dot-path from an object (immutably returns a new object).
 */
function deletePath(
  obj: Record<string, unknown>,
  path: string,
): Record<string, unknown> {
  const segments = path.split('.')
  if (segments.length === 1) {
    const { [segments[0]]: _removed, ...rest } = obj
    return rest
  }
  const [head, ...tail] = segments
  if (!(head in obj) || obj[head] === null || typeof obj[head] !== 'object') {
    return obj
  }
  return {
    ...obj,
    [head]: deletePath(obj[head] as Record<string, unknown>, tail.join('.')),
  }
}

// ---------------------------------------------------------------------------
// Partial reload prop filtering
// ---------------------------------------------------------------------------

export function filterPartialProps(
  props: PageProps,
  partialData: string[],
  partialExcept: string[],
): PageProps {
  let result: PageProps = props

  if (partialData.length > 0) {
    const topLevelKeys = partialData.filter((k) => !k.includes('.'))
    const dotPaths = partialData.filter((k) => k.includes('.'))

    if (dotPaths.length === 0) {
      const keySet = new Set(topLevelKeys)
      result = Object.fromEntries(
        Object.entries(props).filter(([key]) => keySet.has(key)),
      )
    } else {
      let built: PageProps = {}
      for (const key of topLevelKeys) {
        if (key in props) {
          built[key] = props[key]
        }
      }
      for (const dotPath of dotPaths) {
        if (hasPath(props, dotPath)) {
          built = setPath(built as Record<string, unknown>, dotPath, getPath(props, dotPath))
        }
      }
      result = built
    }
  }

  if (partialExcept.length > 0) {
    const topLevelExcept = partialExcept.filter((k) => !k.includes('.'))
    const dotPathExcept = partialExcept.filter((k) => k.includes('.'))

    if (dotPathExcept.length === 0) {
      const exceptSet = new Set(topLevelExcept)
      result = Object.fromEntries(
        Object.entries(result).filter(([key]) => !exceptSet.has(key)),
      )
    } else {
      const exceptSet = new Set(topLevelExcept)
      let filtered: PageProps = Object.fromEntries(
        Object.entries(result).filter(([key]) => !exceptSet.has(key)),
      )
      for (const dotPath of dotPathExcept) {
        filtered = deletePath(filtered as Record<string, unknown>, dotPath)
      }
      result = filtered
    }
  }

  // Always include the `errors` key when it exists in props
  if ('errors' in props && !('errors' in result)) {
    result = { ...result, errors: props['errors'] }
  }

  return result
}

// ---------------------------------------------------------------------------
// URL normalization — pathname + search only, no origin, no hash
// ---------------------------------------------------------------------------

export function normalizeUrl(request: Request): string {
  const url = new URL(request.url)
  return url.pathname + (url.search ?? '')
}

// ---------------------------------------------------------------------------
// 409 location response for version mismatches
// ---------------------------------------------------------------------------

export function makeLocationResponse(url: string): Response {
  return new Response(null, {
    status: 409,
    headers: {
      [HEADER_LOCATION]: url,
    },
  })
}

// ---------------------------------------------------------------------------
// Redirect response
// ---------------------------------------------------------------------------

export interface RedirectOptions {
  fragment?: boolean
}

export function makeRedirectResponse(url: string, options?: RedirectOptions): Response {
  const isFragment = options?.fragment === true || url.includes('#')

  if (isFragment) {
    return new Response(null, {
      status: 409,
      headers: {
        [HEADER_REDIRECT]: url,
      },
    })
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
    },
  })
}
