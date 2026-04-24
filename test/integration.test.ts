import { describe, it, expect } from 'vitest'
import Elysia from 'elysia'
import { inertia, defer } from '../src/index.js'
import type { InertiaOptions } from '../src/types.js'

const simpleDocument: InertiaOptions['document'] = ({ page }) => `<html><body><div id="app" data-page='${JSON.stringify(page)}'></div></body></html>`

function buildApp(extraOptions: Partial<InertiaOptions> = {}) {
  const app = new Elysia()
  app.use(inertia({ document: simpleDocument, ...extraOptions }))

  app.get('/users', ({ inertia }) => inertia.render('Users/Index', {
    users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
    meta: { total: 2 },
  }))

  app.get('/go', ({ inertia }) => inertia.location('https://example.com/destination'))

  return app
}

describe('HTML first visit (no X-Inertia header)', () => {
  it('returns 200 text/html', async () => {
    const res = await buildApp().handle(new Request('http://localhost/users'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
  })

  it('includes Vary: X-Inertia header', async () => {
    const res = await buildApp().handle(new Request('http://localhost/users'))
    expect(res.headers.get('vary')).toContain('X-Inertia')
  })

  it('embeds serialised page JSON inside the document', async () => {
    const body = await (await buildApp().handle(new Request('http://localhost/users'))).text()
    expect(body).toContain('"component":"Users/Index"')
    expect(body).toContain('"name":"Alice"')
    expect(body).toContain('"errors":{}')
  })

  it('page JSON contains a url field', async () => {
    const body = await (await buildApp().handle(new Request('http://localhost/users'))).text()
    expect(body).toContain('"url":"/users"')
  })
})

describe('X-Inertia request (JSON visit)', () => {
  it('returns 200 application/json with X-Inertia: true', async () => {
    const res = await buildApp().handle(new Request('http://localhost/users', { headers: { 'X-Inertia': 'true' } }))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-inertia')).toBe('true')
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
  })

  it('response body is the page object', async () => {
    const page = await (await buildApp().handle(new Request('http://localhost/users', { headers: { 'X-Inertia': 'true' } }))).json()
    expect(page.component).toBe('Users/Index')
    expect(page.props.users).toHaveLength(2)
    expect(page.url).toBe('/users')
  })
})

describe('Version mismatch', () => {
  it('returns 409 with X-Inertia-Location set to the current URL', async () => {
    const res = await buildApp({ version: 'v2' }).handle(new Request('http://localhost/users', { headers: { 'X-Inertia': 'true', 'X-Inertia-Version': 'v1' } }))
    expect(res.status).toBe(409)
    expect(res.headers.get('x-inertia-location')).toBe('/users')
  })

  it('does NOT trigger mismatch when versions match', async () => {
    const res = await buildApp({ version: 'v2' }).handle(new Request('http://localhost/users', { headers: { 'X-Inertia': 'true', 'X-Inertia-Version': 'v2' } }))
    expect(res.status).toBe(200)
  })
})

describe('Partial reload', () => {
  it('returns only the requested prop subset when X-Inertia-Partial-Data is set', async () => {
    const res = await buildApp().handle(new Request('http://localhost/users', { headers: { 'X-Inertia': 'true', 'X-Inertia-Partial-Component': 'Users/Index', 'X-Inertia-Partial-Data': 'users' } }))
    const page = await res.json()
    expect(page.props).toHaveProperty('users')
    expect(page.props).not.toHaveProperty('meta')
  })

  it('returns all props when partial component does not match', async () => {
    const page = await (await buildApp().handle(new Request('http://localhost/users', { headers: { 'X-Inertia': 'true', 'X-Inertia-Partial-Component': 'Other/Component', 'X-Inertia-Partial-Data': 'users' } }))).json()
    expect(page.props).toHaveProperty('users')
    expect(page.props).toHaveProperty('meta')
  })
})

describe('Deferred props', () => {
  it('full visit lists deferred prop in deferredProps metadata, not in props', async () => {
    const app = new Elysia()
    app.use(inertia({ document: simpleDocument }))
    app.get('/dashboard', ({ inertia }) => inertia.render('Dashboard', { title: 'Welcome', stats: defer(() => ({ visits: 42 }), 'metrics') }))

    const page = await (await app.handle(new Request('http://localhost/dashboard', { headers: { 'X-Inertia': 'true' } }))).json()
    expect(page.deferredProps).toEqual({ metrics: ['stats'] })
    expect(page.props).not.toHaveProperty('stats')
    expect(page.props.title).toBe('Welcome')
  })

  it('partial reload resolves targeted deferred prop', async () => {
    const app = new Elysia()
    app.use(inertia({ document: simpleDocument }))
    app.get('/dashboard', ({ inertia }) => inertia.render('Dashboard', { title: 'Welcome', stats: defer(() => ({ visits: 42 }), 'metrics') }))

    const page = await (await app.handle(new Request('http://localhost/dashboard', { headers: { 'X-Inertia': 'true', 'X-Inertia-Partial-Component': 'Dashboard', 'X-Inertia-Partial-Data': 'stats' } }))).json()
    expect(page.props.stats).toEqual({ visits: 42 })
  })

  it('non-targeted deferred props remain unresolved during partial reload', async () => {
    const app = new Elysia()
    app.use(inertia({ document: simpleDocument }))
    app.get('/dashboard', ({ inertia }) => inertia.render('Dashboard', { title: 'Welcome', stats: defer(() => ({ visits: 42 }), 'metrics'), heavy: defer(() => 'expensive', 'other') }))

    const page = await (await app.handle(new Request('http://localhost/dashboard', { headers: { 'X-Inertia': 'true', 'X-Inertia-Partial-Component': 'Dashboard', 'X-Inertia-Partial-Data': 'stats' } }))).json()
    expect(page.props.stats).toEqual({ visits: 42 })
    expect(page.props).not.toHaveProperty('heavy')
  })
})

describe('location()', () => {
  it('returns 409 with X-Inertia-Location pointing to the provided URL', async () => {
    const res = await buildApp().handle(new Request('http://localhost/go'))
    expect(res.status).toBe(409)
    expect(res.headers.get('x-inertia-location')).toBe('https://example.com/destination')
  })
})

describe('share() — global props via options.share', () => {
  it('global props appear in the page for HTML visits', async () => {
    const body = await (await buildApp({ share: () => ({ appName: 'Dogbyte Labs', locale: 'en' }) }).handle(new Request('http://localhost/users'))).text()
    expect(body).toContain('"appName":"Dogbyte Labs"')
    expect(body).toContain('"locale":"en"')
  })

  it('global props appear in the page for Inertia JSON visits', async () => {
    const page = await (await buildApp({ share: () => ({ appName: 'Dogbyte Labs', locale: 'en' }) }).handle(new Request('http://localhost/users', { headers: { 'X-Inertia': 'true' } }))).json()
    expect(page.props.appName).toBe('Dogbyte Labs')
    expect(page.props.locale).toBe('en')
  })

  it('route props take precedence over shared props on key collision', async () => {
    const app = new Elysia()
    app.use(inertia({ document: simpleDocument, share: () => ({ users: 'SHARED' }) }))
    app.get('/users', ({ inertia }) => inertia.render('Users/Index', { users: ['route-value'] }))
    const page = await (await app.handle(new Request('http://localhost/users', { headers: { 'X-Inertia': 'true' } }))).json()
    expect(page.props.users).toEqual(['route-value'])
  })
})

describe('resolveErrors()', () => {
  it('populates props.errors with values returned by the resolver', async () => {
    const page = await (await buildApp({ resolveErrors: () => ({ email: 'is required', name: 'too short' }) }).handle(new Request('http://localhost/users', { headers: { 'X-Inertia': 'true' } }))).json()
    expect(page.props.errors).toEqual({ email: 'is required', name: 'too short' })
  })

  it('props.errors is an empty object when resolveErrors is not configured', async () => {
    const page = await (await buildApp().handle(new Request('http://localhost/users', { headers: { 'X-Inertia': 'true' } }))).json()
    expect(page.props.errors).toEqual({})
  })
})
