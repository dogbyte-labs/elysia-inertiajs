# elysia-inertia

Elysia plugin for [Inertia.js](https://inertiajs.com/). It gives an Elysia app Inertia-aware rendering, shared props, version checks, partial reload support, and optional SSR. Fully compatible with **Inertia.js v1 and v3**.

This is a port of [`@dogbyte-labs/hono-inertiajs`](https://github.com/dogbyte-labs/hono-inertiajs) tailored to Elysia's plugin lifecycle.

## Installation

```bash
npm/pnpm/bun/yarn add elysia-inertia elysia
```

If you are building an Inertia frontend, install the matching adapter too:

```bash
npm/pnpm/bun/yarn add @inertiajs/react react react-dom
# or
npm/pnpm/bun/yarn add @inertiajs/vue3 vue
```

## Usage

### 1) Create a document renderer

The `document` renderer returns the HTML shell for the first visit.

Use `renderInertiaRoot` (v3+) to generate the Inertia root element automatically — it serialises the page object and sets the correct `id` and `data-page` attributes:

```ts
import { Elysia } from 'elysia'
import {
  inertia,
  renderInertiaRoot,
  type InertiaOptions,
} from 'elysia-inertia'

const document: InertiaOptions['document'] = ({ page, ssr }) => {
  const headTags = ssr?.head?.join('\n') ?? ''

  // Builds <div id="app" data-page="…">…</div> plus an optional script tag.
  const rootHtml = renderInertiaRoot(page, {
    id: 'app',
    ssr,
    scriptSrc: '/assets/app.js',
  })

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${headTags}
  </head>
  <body>
    ${rootHtml}
  </body>
</html>`
}
```

Or build the root element manually (v1/v2 style):

```ts
const document: InertiaOptions['document'] = ({ page, ssr }) => {
  const appHtml = ssr?.body ?? ''
  const headTags = ssr?.head?.join('\n') ?? ''

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${headTags}
  </head>
  <body>
    <div id="app" data-page='${JSON.stringify(page)}'>${appHtml}</div>
  </body>
</html>`
}
```

### 2) Mount the plugin

Unlike Hono — where you call `app.use('*', inertia(...))` as a middleware — in Elysia you mount `inertia(...)` as a **plugin** via `.use(...)`. Once mounted, every route in the same scope gains an `inertia` property on its handler context.

```ts
const app = new Elysia()

app.use(
  inertia({
    document,
    version: '1.0.0',
    share: async (c) => ({
      auth: { user: null },
    }),
    resolveErrors: async (_c) => ({}),
  }),
)
```

> The plugin uses Elysia's `derive` + `resolve` lifecycle hooks under the hood, scoped so they only apply to the app/group the plugin is mounted on.

### 3) Render pages from routes

Routes destructure the `inertia` facade directly from the handler context:

```ts
app.get('/users', async ({ inertia }) => {
  const users = await getUsers()

  return inertia.render('Users/Index', { users })
})

app.get('/logout', ({ inertia }) => {
  return inertia.location('https://example.com')
})
```

### 4) Optional per-request shared props

```ts
app.get('/dashboard', ({ inertia }) => {
  inertia.share({ flash: 'Saved successfully' })

  return inertia.render('Dashboard', { count: 42 })
})
```

## Facade API

Every handler in the inertia scope receives an `inertia` object with the following methods:

| Method | Description |
| --- | --- |
| `render(component, props?, options?)` | Returns an Inertia response (HTML on first visit, JSON on subsequent visits). `options` accepts `status`, `headers`, `clearHistory`, `encryptHistory`, `preserveFragment`, `preserveScroll`. |
| `share(props \| (c) => props)` | Merges per-request shared props into the page (in addition to `options.share`). |
| `location(url)` | Returns a `409` with `X-Inertia-Location` — hard external redirect. |
| `redirect(url)` | Returns a soft Inertia SPA redirect (v3+). |
| `isInertiaRequest()` | `true` when the request carries `X-Inertia: true`. |
| `isPrefetch()` | `true` when the request was sent with `Purpose: prefetch`. |

## Inertia v3 Support

### Prop wrappers

Prop wrappers let you control how individual props are sent to the client.

#### `defer` — lazy / deferred props

```ts
import { defer } from 'elysia-inertia'

app.get('/users', async ({ inertia }) => {
  const users = await getUsers()

  return inertia.render('Users/Index', {
    // Sent immediately.
    users,

    // Fetched lazily after the initial page load.
    // The client receives `undefined` on the first render; Inertia fills it
    // in with a follow-up request automatically.
    stats: defer(() => getExpensiveStats()),

    // Optional group name — multiple deferred props in the same group are
    // fetched together in a single follow-up request.
    chart: defer(() => getChartData(), 'analytics'),
  })
})
```

#### `merge` / `deepMerge` — incremental / infinite-scroll props

```ts
import { merge, deepMerge } from 'elysia-inertia'

app.get('/feed', async ({ inertia }) => {
  const posts = await getPosts()

  return inertia.render('Feed', {
    // On subsequent visits the new list is merged (appended) to the
    // client's existing list rather than replacing it.
    posts: merge(posts),
  })
})
```

#### `once` — flash / single-delivery props

```ts
import { once } from 'elysia-inertia'

app.get('/dashboard', async ({ inertia }) => {
  return inertia.render('Dashboard', {
    // Delivered to the client exactly once per key.
    // On every subsequent visit the prop resolves to `undefined`.
    flash: once(
      async () => session.pull('flash'),
      `flash:${session.id}`,
    ),
  })
})
```

#### `always` / `optional` / `lazy`

```ts
import { always, optional, lazy } from 'elysia-inertia'

// always — included even on partial reloads that don't request this prop.
// optional — excluded from partial reloads unless explicitly requested.
// lazy — alias for optional.
app.get('/page', ({ inertia }) =>
  inertia.render('Page', {
    critical: always(() => getCriticalData()),
    heavy: optional(() => getHeavyData()),
  }),
)
```

### `renderInertiaRoot`

Generates the Inertia root element HTML string.

```ts
import { renderInertiaRoot } from 'elysia-inertia'

const html = renderInertiaRoot(page, {
  id: 'app',         // defaults to "app"
  ssr,               // optional SSR result ({ body, head })
  scriptSrc: '/assets/app.js', // optional; injects <script type="module">
})
```

### `redirect`

Triggers a client-side Inertia redirect (stays within the SPA).

```ts
app.post('/users/:id/archive', async ({ inertia, params }) => {
  await archiveUser(Number(params.id))

  return inertia.redirect('/users')
})
```

### `isPrefetch`

Returns `true` when the request is an Inertia prefetch. Skip analytics, DB writes, and other side-effects for prefetch requests.

```ts
app.get('/users', async ({ inertia, request }) => {
  if (!inertia.isPrefetch()) {
    await recordPageView(request)
  }

  return inertia.render('Users/Index', { users: await getUsers() })
})
```

### Precognition plugin

Enable [Laravel Precognition](https://laravel.com/docs/precognition)-style validation for your routes:

```ts
import { precognition } from 'elysia-inertia'

app.use(
  precognition({
    validate: async (c, fields) => {
      // run your validation; return errors or null
      return null
    },
  }),
)
```


### `createInMemoryOnceStore`

Factory for a simple in-memory `OnceStore`. Works for single-process deployments. For multi-process or edge deployments implement the `OnceStore` interface backed by Redis or another shared store.

```ts
import { createInMemoryOnceStore } from 'elysia-inertia'

const store = createInMemoryOnceStore()

app.use(inertia({ document, onceStore: store }))
```

## React frontend example

```tsx
import { Head } from '@inertiajs/react'

type User = { id: number; name: string; email: string }

type Props = {
  users: User[]
}

export default function UsersIndex({ users }: Props) {
  return (
    <>
      <Head title="Users" />
      <ul>
        {users.map((user) => (
          <li key={user.id}>{user.name}</li>
        ))}
      </ul>
    </>
  )
}
```

## Worth noting

- First visits return HTML; Inertia visits return JSON with `X-Inertia: true`.
- `document` is required and can return a `string` or a `Response`.
- `version` can be a string or an async function.
- `resolveErrors()` defaults to `{}`, and `props.errors` is always present.
- Partial reload headers are supported: `X-Inertia-Partial-Component`, `X-Inertia-Partial-Data`, and `X-Inertia-Partial-Except`.
- `inertia.location(url)` returns `409` with `X-Inertia-Location` (hard external redirect).
- `inertia.redirect(url)` returns a soft Inertia SPA redirect (v3+).
- `inertia.isPrefetch()` returns `true` for Inertia prefetch requests (v3+).
- `ssr` is optional; if it fails, the adapter falls back to normal rendering.
- The plugin is mounted via `.use(inertia(...))` and is scoped — it only affects the app/group it is mounted on.
- The package is ESM-only and ships compiled output from `dist/`.
- Prop wrappers (`defer`, `merge`, `once`, etc.) require Inertia.js v3 on the frontend.

## Development

```bash
pnpm install
pnpm test
pnpm build
```

## Example

See `examples/basic.ts` for a complete server-side walkthrough.

## License

ISC
