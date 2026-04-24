/**
 * examples/basic.ts
 *
 * Minimal but complete example showing how to wire up the Inertia adapter for
 * Elysia.  Read this top-to-bottom to understand the intended developer
 * experience.
 *
 * This file is valid TypeScript — it will compile, though it is not intended
 * to be run as-is (the DB calls are illustrative stubs).
 */

import { Elysia } from 'elysia'
import {
  inertia,
  precognition,
  renderInertiaRoot,
  defer,
  merge,
  once,
  type InertiaOptions,
  type DocumentRenderer,
} from 'elysia-inertia'

// ---------------------------------------------------------------------------
// 1. Document renderer
//
//    The document renderer is responsible for returning the full HTML shell
//    for first-visit (non-Inertia) requests.  It receives:
//
//      • page  — the serialised InertiaPage object to embed in the HTML
//      • c     — the raw Elysia Context (useful for injecting nonces, CSP, etc.)
//      • ssr   — optional SSR result ({ body, head }) if an SSR renderer is
//                configured; null otherwise
//
//    `renderInertiaRoot` handles the Inertia v3 bootstrap HTML: it serialises
//    the page object and sets the correct `id` attribute and `data-page`
//    attribute on the root element automatically.
// ---------------------------------------------------------------------------

const document: DocumentRenderer = ({ page, ssr }) => {
  // When SSR is enabled `ssr.body` is the pre-rendered HTML string.
  // The head tags (title, meta, etc.) produced by the SSR renderer.
  const headTags = ssr?.head?.join('\n') ?? ''

  // renderInertiaRoot builds the <div id="app" data-page="...">…</div> markup.
  // Pass { ssr } to include pre-rendered HTML inside the element, and
  // { scriptSrc } to inject a <script type="module"> tag automatically.
  const rootHtml = renderInertiaRoot(page, {
    id: 'app',
    ssr,
    scriptSrc: '/assets/app.js',
  })

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${headTags}
  </head>
  <body>
    ${rootHtml}
  </body>
</html>`
}

// ---------------------------------------------------------------------------
// 2. Plugin options
//
//    • document        — required; the renderer from step 1
//    • share           — optional; props merged into EVERY page response
//                        (great for auth user, flash messages, locale, etc.)
//    • version         — optional; asset version string used by the client to
//                        detect stale assets and trigger a full-page reload
//    • resolveErrors   — optional; read validation errors from your session
//                        and expose them as `props.errors` in the page
//    • onceStore       — optional; pluggable store for `once()` prop tracking
//    • ssr             — optional; an SSR renderer
// ---------------------------------------------------------------------------

const options: InertiaOptions = {
  document,

  // Global shared props — available in every component without being passed
  // explicitly from each route handler.
  share: async (_c) => {
    // In a real app you would read the authenticated user from the session /
    // JWT.  Here we return a static placeholder.
    return {
      auth: {
        user: { id: 1, name: 'Alice', email: 'alice@example.com' },
      },
    }
  },

  // The asset version string.  Whenever your frontend build changes, update
  // this value.  Inertia will detect the mismatch and force a hard reload so
  // the user always runs the latest JS.
  version: '1.0.0',

  // Read validation errors from the session and expose them as `props.errors`.
  // The errors bag is always present in the page — it's just empty by default.
  resolveErrors: async (_c) => {
    // In a real app: return session.pull('errors') or similar.
    return {}
  },
}

// ---------------------------------------------------------------------------
// 3. App setup
//
// Mount the Inertia plugin via `.use(...)`.  Unlike Hono, Elysia plugins are
// scoped: every route registered after `.use(inertia(...))` on the same app
// (or group) gets the `inertia` facade exposed on its handler context.
// ---------------------------------------------------------------------------

const app = new Elysia()
app.use(inertia(options))

// ---------------------------------------------------------------------------
// 4. Route handlers
// ---------------------------------------------------------------------------

// Illustrative type for a User record — replace with your real model.
interface User {
  id: number
  name: string
  email: string
}

// Stub database call — replace with your ORM / data layer.
async function getUsers(): Promise<User[]> {
  return [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
  ]
}

// Stub for an expensive aggregation query.
async function getUserStats(): Promise<{ total: number; active: number }> {
  return { total: 2, active: 1 }
}

/**
 * GET /users
 *
 * `inertia.render(component, props)` is the primary way to return an Inertia
 * response.
 *
 * • On a first visit  → returns a full HTML document (via your document
 *                        renderer) with the page JSON embedded.
 * • On subsequent XHR → returns a JSON payload with `X-Inertia: true`.
 *
 * The Inertia JS client handles both transparently; you always write the same
 * route handler.
 *
 * --- Prop wrappers ---
 *
 * `defer(fn)` marks a prop as deferred: the initial page load omits it and
 * Inertia issues a follow-up request to fill it in.  Great for expensive data
 * that is not needed for the initial paint.  An optional group name lets
 * multiple deferred props be fetched together in one round-trip.
 *
 * `merge(value)` tells Inertia to merge the new value with the previous value
 * already held by the client — useful for append-only lists / infinite scroll.
 *
 * `isPrefetch()` returns true when the request is an Inertia prefetch.  Skip
 * side-effects (logging, analytics, DB writes) for prefetch requests.
 */
app.get('/users', async ({ inertia }) => {
  // Skip side-effects for prefetch requests.
  if (!inertia.isPrefetch()) {
    // e.g. record a page view
  }

  const users = await getUsers()

  return inertia.render('Users/Index', {
    // Regular prop — sent immediately.
    users,

    // Deferred prop — fetched lazily after the initial page load.
    // The frontend receives `undefined` on the first render, then Inertia
    // fills it in with a follow-up request automatically.
    stats: defer(() => getUserStats()),

    // Merge prop — when navigating back to this page the new users list is
    // merged with (appended to) the client's existing list rather than
    // replacing it.  Ideal for infinite-scroll / pagination patterns.
    recentUsers: merge(users),
  })
})

/**
 * GET /users/:id
 *
 * Example showing a single-resource route with typed props.  Pass status
 * codes through `render()`'s third options argument.
 */
app.get('/users/:id', async ({ inertia, params }) => {
  const id = Number(params.id)
  const allUsers = await getUsers()
  const user = allUsers.find((u) => u.id === id)

  if (!user) {
    return inertia.render('Errors/NotFound', {}, { status: 404 })
  }

  return inertia.render('Users/Show', { user })
})

/**
 * GET /dashboard
 *
 * Demonstrates `once` for flash messages.
 *
 * `once(fn, key)` wraps a prop so it is delivered to the client exactly once
 * per unique key.  On every subsequent visit the prop resolves to `undefined`.
 * This mirrors Laravel's "flash" session behaviour.
 *
 * The key should be unique per user / session.  Here we use a hard-coded key
 * for illustration; in a real app derive it from the session ID.
 */
app.get('/dashboard', async ({ inertia }) => {
  // Per-request shared props — merged into the page in addition to the
  // global `share()` configured on the plugin.
  inertia.share({ flash: 'Welcome back!' })

  return inertia.render('Dashboard', {
    count: 42,

    // Flash message — delivered once, then cleared.
    onboardingTip: once(async () => {
      return 'Tip of the day: try the keyboard shortcuts!'
    }, 'onboarding:user-1'),
  })
})

/**
 * POST /users/:id/archive
 *
 * Demonstrates `redirect()` for Inertia fragment redirects (v3+).
 *
 * `inertia.redirect(url)` issues a client-side redirect that stays within the
 * Inertia SPA — it sets the correct response headers so the Inertia client
 * performs a programmatic navigation instead of a full reload.
 */
app.post('/users/:id/archive', async ({ inertia }) => {
  // … perform the archive action …

  return inertia.redirect('/users')
})

/**
 * GET /external-redirect
 *
 * `inertia.location(url)` triggers a client-side hard redirect to any URL —
 * even an external one.  Under the hood it returns a 409 response with the
 * `X-Inertia-Location` header, which the Inertia client converts into a
 * `window.location` assignment.
 *
 * Use this instead of a plain 302 redirect when inside an Inertia route so
 * the client handles it correctly.
 */
app.get('/external-redirect', ({ inertia }) => {
  return inertia.location('https://example.com/dashboard')
})

// ---------------------------------------------------------------------------
// 5. Precognition
//
//    Mount the precognition plugin to handle Laravel Precognition-style
//    preflight validation requests.
//
//    API difference vs. Hono: in Hono you mount `precognition()` per-route
//    as middleware. In Elysia you mount the plugin once on the app (or a
//    scoped group) via `.use(...)` and it inspects every request that passes
//    through that scope. Non-Precognition requests fall through to the real
//    handler untouched.
//
//    To restrict validation to a subset of routes, mount it inside a group:
// ---------------------------------------------------------------------------

app.group('/users', (g) =>
  g
    .use(
      precognition({
        validate: async (_c, fields) => {
          // `fields` is the parsed `Precognition-Validate-Only` header.
          // Return a non-empty errors object to produce a 422 response;
          // return null/undefined/{} to signal success (204).
          if (fields.includes('email')) {
            return { email: 'Please provide a valid email' }
          }
          return null
        },
      }),
    )
    .post('/', async ({ inertia }) => {
      // Real submissions still hit this handler.
      return inertia.redirect('/users')
    }),
)

// Export so this module is a valid ES module (not used at runtime in this
// example but required for TypeScript to treat it as a module).
export { app }
