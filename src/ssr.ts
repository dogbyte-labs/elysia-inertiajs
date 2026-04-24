import type { Context } from 'elysia'
import type { InertiaPage, SsrRenderer, SsrResult } from './types.js'

/**
 * ## SSR contract
 *
 * The renderer is called with `{ page, c }` where:
 * - `page` — the complete Inertia v3 page object
 * - `c` — the Elysia `Context` for the current request
 *
 * Return an `SsrResult` or `null` to fall back to CSR:
 * ```ts
 * interface SsrResult {
 *   body: string       // HTML to inject inside the Inertia root div
 *   head?: string[]    // <head> snippets to inject
 * }
 * ```
 */

/**
 * Invoke the SSR renderer if one is configured.
 * Returns null when no renderer is configured or when the renderer fails/returns null.
 */
export async function runSsr(
  renderer: SsrRenderer | false | undefined,
  page: InertiaPage,
  c: Context,
): Promise<SsrResult | null> {
  if (!renderer) return null

  try {
    const result = await renderer({ page, c })
    return result ?? null
  } catch {
    return null
  }
}
