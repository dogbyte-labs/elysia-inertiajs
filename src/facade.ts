import type { Context } from 'elysia'
import type {
  InertiaFacade,
  InertiaOptions,
  InertiaPage,
  PageProps,
  RenderOptions,
  MaybePromise,
} from './types.js'
import { assemblePageObject, defaultOnceStore } from './page.js'
import {
  isInertiaRequest as detectInertiaRequest,
  makeLocationResponse,
  makeRedirectResponse,
  parseInertiaHeaders,
} from './protocol.js'
import type { InertiaRequestState } from './context.js'
import { buildResponse } from './document.js'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function resolveVersion(
  options: InertiaOptions,
  request: Request,
  c: Context,
): Promise<string | null> {
  if (options.version === undefined || options.version === null) return null
  if (typeof options.version === 'function') return options.version(c) ?? null
  return options.version
}

async function resolveErrors(c: Context, options: InertiaOptions): Promise<Record<string, string | string[]>> {
  if (options.resolveErrors) return options.resolveErrors(c)
  return {}
}

async function resolveGlobalShared(c: Context, options: InertiaOptions): Promise<PageProps> {
  if (options.share) return options.share(c)
  return {}
}

async function resolveRequestShared(
  state: InertiaRequestState,
  request: Request,
): Promise<PageProps> {
  let merged: PageProps = {}
  for (const entry of state.sharedProps) {
    const resolved: PageProps =
      typeof entry === 'function'
        ? await (entry as (req: Request) => MaybePromise<PageProps>)(request)
        : entry
    merged = { ...merged, ...resolved }
  }
  return merged
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createFacade(
  state: InertiaRequestState,
  options: InertiaOptions,
  c: Context,
): InertiaFacade {
  const request = c.request

  return {
    isInertiaRequest(): boolean {
      return detectInertiaRequest(request)
    },

    isPrefetch(): boolean {
      return state.isPrefetch
    },

    share(props: PageProps | ((c: Context) => MaybePromise<PageProps>)): void {
      // Wrap Context-based share functions so they are stored as Request-based
      if (typeof props === 'function') {
        const fn = props as (c: Context) => MaybePromise<PageProps>
        state.sharedProps.push(() => fn(c))
      } else {
        state.sharedProps.push(props)
      }
    },

    location(url: string): Response {
      return makeLocationResponse(url)
    },

    redirect(url: string): Response {
      return makeRedirectResponse(url)
    },

    async render<Props extends PageProps>(
      component: string,
      props?: Props,
      renderOptions?: RenderOptions,
    ): Promise<Response> {
      const [version, errors, globalShared, requestShared] = await Promise.all([
        resolveVersion(options, request, c),
        resolveErrors(c, options),
        resolveGlobalShared(c, options),
        resolveRequestShared(state, request),
      ])

      const parsed = parseInertiaHeaders(request)

      const page: InertiaPage = await assemblePageObject({
        component,
        routeProps: props ?? {},
        globalSharedProps: globalShared,
        requestSharedProps: requestShared,
        errors,
        version,
        request,
        clearHistory: renderOptions?.clearHistory,
        encryptHistory: renderOptions?.encryptHistory,
        preserveFragment: renderOptions?.preserveFragment,
        preserveScroll: renderOptions?.preserveScroll,
        onceStore: options.onceStore ?? defaultOnceStore,
        resetKeys: parsed.reset,
      })

      return buildResponse({
        page,
        c,
        options,
        isInertia: detectInertiaRequest(request),
        status: renderOptions?.status,
        headers: renderOptions?.headers,
      })
    },
  }
}
