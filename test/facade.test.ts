import { describe, it, expect } from 'vitest'
import Elysia from 'elysia'
import { inertia } from '../src/index.js'
import type { InertiaOptions } from '../src/types.js'

const simpleDocument: InertiaOptions['document'] = ({ page }) => `<html><body><div id="app" data-page='${JSON.stringify(page)}'></div></body></html>`

function makeApp(extraOptions: Partial<InertiaOptions> = {}) {
  const app = new Elysia()
  app.use(inertia({ document: simpleDocument, ...extraOptions }))

  app.get('/dashboard', ({ inertia }) => inertia.render('Dashboard', { count: 42 }))
  app.get('/share-test', ({ inertia }) => {
    inertia.share({ sharedKey: 'sharedValue' })
    return inertia.render('ShareTest', { routeProp: 'yes' })
  })
  app.get('/location-test', ({ inertia }) => inertia.location('https://example.com/new'))
  app.get('/redirect-test', ({ inertia }) => inertia.redirect('/dashboard'))
  app.get('/is-inertia', ({ inertia }) => inertia.isInertiaRequest() ? new Response(JSON.stringify({ isInertia: true }), { headers: { 'Content-Type': 'application/json' } }) : new Response(JSON.stringify({ isInertia: false }), { headers: { 'Content-Type': 'application/json' } }))
  app.get('/is-prefetch', ({ inertia }) => new Response(JSON.stringify({ isPrefetch: inertia.isPrefetch() }), { headers: { 'Content-Type': 'application/json' } }))
  app.get('/prefetch-share', ({ inertia }) => {
    inertia.share({ prefetchShared: true })
    return inertia.render('PrefetchPage', { direct: 'yes' })
  })

  return app
}

describe('facade integration', () => {
  it('HTML first visit returns document response', async () => {
    const res = await makeApp().handle(new Request('http://localhost/dashboard'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
    expect(res.headers.get('vary')).toContain('X-Inertia')
    const body = await res.text()
    expect(body).toContain('<div id="app"')
    expect(body).toContain('"component":"Dashboard"')
    expect(body).toContain('"count":42')
  })

  it('X-Inertia request returns JSON with X-Inertia: true header', async () => {
    const res = await makeApp().handle(new Request('http://localhost/dashboard', { headers: { 'X-Inertia': 'true' } }))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-inertia')).toBe('true')
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    expect(res.headers.get('vary')).toContain('X-Inertia')
    const json = await res.json()
    expect(json.component).toBe('Dashboard')
    expect(json.props.count).toBe(42)
  })

  it('location() returns 409 with X-Inertia-Location header', async () => {
    const res = await makeApp().handle(new Request('http://localhost/location-test'))
    expect(res.status).toBe(409)
    expect(res.headers.get('x-inertia-location')).toBe('https://example.com/new')
  })

  it('redirect() returns standard redirect response', async () => {
    const res = await makeApp().handle(new Request('http://localhost/redirect-test'))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/dashboard')
  })

  it('share() props appear in rendered page for HTML visit', async () => {
    const res = await makeApp().handle(new Request('http://localhost/share-test'))
    const body = await res.text()
    expect(body).toContain('"sharedKey":"sharedValue"')
    expect(body).toContain('"routeProp":"yes"')
  })

  it('share() props appear in rendered page for Inertia JSON visit', async () => {
    const res = await makeApp().handle(new Request('http://localhost/share-test', { headers: { 'X-Inertia': 'true' } }))
    const json = await res.json()
    expect(json.props.sharedKey).toBe('sharedValue')
    expect(json.props.routeProp).toBe('yes')
  })

  it('isInertiaRequest() returns false for plain HTTP request', async () => {
    const res = await makeApp().handle(new Request('http://localhost/is-inertia'))
    expect((await res.json()).isInertia).toBe(false)
  })

  it('isInertiaRequest() returns true for Inertia request', async () => {
    const res = await makeApp().handle(new Request('http://localhost/is-inertia', { headers: { 'X-Inertia': 'true' } }))
    expect((await res.json()).isInertia).toBe(true)
  })

  it('global share via options.share appears in props', async () => {
    const res = await makeApp({ share: () => ({ globalProp: 'fromOptions' }) }).handle(new Request('http://localhost/dashboard', { headers: { 'X-Inertia': 'true' } }))
    expect((await res.json()).props.globalProp).toBe('fromOptions')
  })

  it('version mismatch on GET Inertia request returns 409 with current URL', async () => {
    const res = await makeApp({ version: 'v2' }).handle(new Request('http://localhost/dashboard', { headers: { 'X-Inertia': 'true', 'X-Inertia-Version': 'v1' } }))
    expect(res.status).toBe(409)
    expect(res.headers.get('x-inertia-location')).toBe('/dashboard')
  })

  it('isPrefetch() returns false for a regular request', async () => {
    const res = await makeApp().handle(new Request('http://localhost/is-prefetch'))
    expect((await res.json()).isPrefetch).toBe(false)
  })

  it('isPrefetch() returns true when Purpose: prefetch header is present', async () => {
    const res = await makeApp().handle(new Request('http://localhost/is-prefetch', { headers: { Purpose: 'prefetch' } }))
    expect((await res.json()).isPrefetch).toBe(true)
  })

  it('share() inside a prefetch request still produces a valid response', async () => {
    const res = await makeApp().handle(new Request('http://localhost/prefetch-share', { headers: { 'X-Inertia': 'true', Purpose: 'prefetch' } }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.props.prefetchShared).toBe(true)
    expect(json.props.direct).toBe('yes')
    expect(json.component).toBe('PrefetchPage')
  })
})
