import type { Context } from 'elysia'
import type { InertiaOptions, InertiaPage, SsrResult } from './types.js'
import { runSsr } from './ssr.js'

// ---------------------------------------------------------------------------
// renderInertiaRoot — v3 bootstrap helper
// ---------------------------------------------------------------------------

export interface RenderInertiaRootOptions {
  /** The element id. Defaults to `'app'`. */
  id?: string
  /** If provided, the SSR body is rendered inside the div. */
  ssr?: SsrResult | null
  /** If provided, a `<script type="module" src="...">` tag is appended. */
  scriptSrc?: string
}

/**
 * Escape characters that are unsafe inside an HTML attribute value.
 */
function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;')
}

/**
 * Build the Inertia v3 bootstrap HTML fragment:
 *
 * ```html
 * <div id="app" data-page="{escaped JSON}"><!-- SSR body --></div>
 * <script type="module" src="/build/app.js"></script>
 * ```
 */
export function renderInertiaRoot(
  page: InertiaPage,
  options: RenderInertiaRootOptions = {},
): string {
  const { id = 'app', ssr = null, scriptSrc } = options

  const escapedPage = escapeHtmlAttr(JSON.stringify(page))
  const ssrBody = ssr?.body ?? ''
  const div = `<div id="${id}" data-page="${escapedPage}">${ssrBody}</div>`

  if (scriptSrc) {
    return `${div}\n<script type="module" src="${scriptSrc}"></script>`
  }

  return div
}

export interface BuildResponseParams {
  page: InertiaPage
  c: Context
  options: InertiaOptions
  isInertia: boolean
  status?: number
  headers?: HeadersInit
}

/**
 * Build the final HTTP response for an Inertia render call.
 *
 * - Inertia (XHR/JSON) path: returns JSON with X-Inertia and Vary headers.
 * - HTML (first-visit) path: invokes optional SSR, then calls the document
 *   renderer and wraps the result in a text/html Response.
 */
export async function buildResponse({
  page,
  c,
  options,
  isInertia,
  status = 200,
  headers,
}: BuildResponseParams): Promise<Response> {
  const extraHeaders = new Headers(headers as HeadersInit | undefined)

  if (isInertia) {
    const responseHeaders = new Headers(extraHeaders)
    responseHeaders.set('Content-Type', 'application/json')
    responseHeaders.set('X-Inertia', 'true')
    responseHeaders.set('Vary', 'X-Inertia')

    return new Response(JSON.stringify(page), { status, headers: responseHeaders })
  }

  // HTML path: run SSR (if configured), then call document renderer
  const ssr = await runSsr(options.ssr, page, c)
  const result = await options.document({ page, c, ssr })

  if (result instanceof Response) {
    const cloned = new Response(result.body, result)
    cloned.headers.set('Vary', 'X-Inertia')
    if (status !== 200 || extraHeaders.keys().next().done === false) {
      const merged = new Response(cloned.body, {
        status,
        headers: cloned.headers,
      })
      for (const [key, value] of extraHeaders.entries()) {
        merged.headers.set(key, value)
      }
      return merged
    }
    return cloned
  }

  const responseHeaders = new Headers(extraHeaders)
  responseHeaders.set('Content-Type', 'text/html; charset=UTF-8')
  responseHeaders.set('Vary', 'X-Inertia')

  return new Response(result, { status, headers: responseHeaders })
}
