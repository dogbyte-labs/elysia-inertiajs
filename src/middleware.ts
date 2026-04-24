import Elysia from 'elysia'
import type { InertiaOptions, PageProps } from './types.js'
import type { InertiaRequestState } from './context.js'
import {
  parseInertiaHeaders,
  checkVersionMismatch,
  makeLocationResponse,
  normalizeUrl,
} from './protocol.js'
import { createFacade } from './facade.js'

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

export function inertia<Shared extends PageProps = PageProps>(
  options: InertiaOptions<Shared>,
) {
  return new Elysia({ name: 'elysia-inertia' })
    // Per-request state via derive (scoped, not shared across requests)
    .derive({ as: 'scoped' }, ({ request }) => {
      const parsed = parseInertiaHeaders(request)

      const state: InertiaRequestState = {
        sharedProps: [],
        isPrefetch: parsed.prefetch,
      }

      return { _inertiaState: state, _inertiaHeaders: parsed }
    })
    // Version-mismatch guard — runs before route handlers
    .onBeforeHandle({ as: 'scoped' }, async ({ request, _inertiaHeaders }) => {
      if (_inertiaHeaders.inertia && request.method === 'GET') {
        const serverVersion =
          options.version === undefined || options.version === null
            ? null
            : typeof options.version === 'function'
              ? await options.version({ request } as any)
              : options.version

        if (checkVersionMismatch(request, _inertiaHeaders.version, serverVersion ?? null)) {
          return makeLocationResponse(normalizeUrl(request))
        }
      }
    })
    // Expose the inertia facade on context
    .resolve({ as: 'scoped' }, (ctx) => {
      const facade = createFacade(
        ctx._inertiaState,
        options as InertiaOptions,
        ctx as any,
      )
      return { inertia: facade }
    })
}
