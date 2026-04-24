import { describe, it, expect, vi } from 'vitest'
import type { Context } from 'elysia'
import type { InertiaOptions, InertiaPage, SsrResult } from '../src/types.js'
import { buildResponse, renderInertiaRoot } from '../src/document.js'
import { runSsr } from '../src/ssr.js'

function makePage(overrides: Partial<InertiaPage> = {}): InertiaPage {
  return { component: 'TestPage', props: { errors: {} }, url: '/test', version: null, ...overrides }
}

function makeContext(): Context {
  return { request: new Request('http://localhost/test') } as unknown as Context
}

const simpleDocument: InertiaOptions['document'] = ({ page, ssr }) => {
  const ssrMark = ssr ? `data-ssr="${ssr.body}"` : ''
  return `<html><body><div id="app" data-page='${JSON.stringify(page)}' ${ssrMark}></div></body></html>`
}

function makeOptions(overrides: Partial<InertiaOptions> = {}): InertiaOptions {
  return { document: simpleDocument, ...overrides }
}

describe('buildResponse — HTML first visit', () => {
  it('returns text/html response', async () => {
    const res = await buildResponse({ page: makePage(), c: makeContext(), options: makeOptions(), isInertia: false })
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
  })

  it('adds Vary: X-Inertia header', async () => {
    const res = await buildResponse({ page: makePage(), c: makeContext(), options: makeOptions(), isInertia: false })
    expect(res.headers.get('vary')).toContain('X-Inertia')
  })

  it('body contains rendered document', async () => {
    const res = await buildResponse({ page: makePage({ component: 'Dashboard' }), c: makeContext(), options: makeOptions(), isInertia: false })
    const body = await res.text()
    expect(body).toContain('<div id="app"')
    expect(body).toContain('"component":"Dashboard"')
  })

  it('applies custom status code', async () => {
    const res = await buildResponse({ page: makePage(), c: makeContext(), options: makeOptions(), isInertia: false, status: 201 })
    expect(res.status).toBe(201)
  })

  it('applies custom headers', async () => {
    const res = await buildResponse({ page: makePage(), c: makeContext(), options: makeOptions(), isInertia: false, headers: { 'X-Custom-Header': 'hello' } })
    expect(res.headers.get('x-custom-header')).toBe('hello')
  })
})

describe('buildResponse — JSON X-Inertia visit', () => {
  it('returns application/json response', async () => {
    const res = await buildResponse({ page: makePage(), c: makeContext(), options: makeOptions(), isInertia: true })
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
  })

  it('sets X-Inertia: true header', async () => {
    const res = await buildResponse({ page: makePage(), c: makeContext(), options: makeOptions(), isInertia: true })
    expect(res.headers.get('x-inertia')).toBe('true')
  })

  it('adds Vary: X-Inertia header', async () => {
    const res = await buildResponse({ page: makePage(), c: makeContext(), options: makeOptions(), isInertia: true })
    expect(res.headers.get('vary')).toContain('X-Inertia')
  })

  it('body is JSON-serialised page object', async () => {
    const page = makePage({ component: 'Profile', url: '/profile' })
    const res = await buildResponse({ page, c: makeContext(), options: makeOptions(), isInertia: true })
    const json = await res.json()
    expect(json.component).toBe('Profile')
    expect(json.url).toBe('/profile')
  })

  it('applies custom status code', async () => {
    const res = await buildResponse({ page: makePage(), c: makeContext(), options: makeOptions(), isInertia: true, status: 422 })
    expect(res.status).toBe(422)
  })

  it('applies custom headers', async () => {
    const res = await buildResponse({ page: makePage(), c: makeContext(), options: makeOptions(), isInertia: true, headers: { 'X-Request-Id': 'abc123' } })
    expect(res.headers.get('x-request-id')).toBe('abc123')
  })

  it('does NOT invoke document renderer for Inertia requests', async () => {
    const documentFn = vi.fn().mockReturnValue('<html></html>')
    await buildResponse({ page: makePage(), c: makeContext(), options: makeOptions({ document: documentFn }), isInertia: true })
    expect(documentFn).not.toHaveBeenCalled()
  })
})

describe('SSR payload injection', () => {
  it('passes SSR result to document renderer when SSR renderer is provided', async () => {
    const ssrRenderer = vi.fn().mockResolvedValue({ body: '<app>SSR content</app>', head: ['<title>SSR</title>'] } satisfies SsrResult)
    const documentFn = vi.fn().mockImplementation(({ ssr }: { ssr: SsrResult | null }) => `<html><body>${ssr?.body ?? ''}</body></html>`)
    await buildResponse({ page: makePage(), c: makeContext(), options: makeOptions({ ssr: ssrRenderer, document: documentFn }), isInertia: false })
    expect(ssrRenderer).toHaveBeenCalledOnce()
    expect(documentFn).toHaveBeenCalledWith(expect.objectContaining({ ssr: { body: '<app>SSR content</app>', head: ['<title>SSR</title>'] } }))
  })

  it('SSR result body appears in rendered HTML', async () => {
    const ssrRenderer = vi.fn().mockResolvedValue({ body: '<app>Hello SSR</app>' } satisfies SsrResult)
    const res = await buildResponse({ page: makePage(), c: makeContext(), options: makeOptions({ ssr: ssrRenderer }), isInertia: false })
    expect(await res.text()).toContain('Hello SSR')
  })

  it('passes null ssr to document renderer when no SSR renderer configured', async () => {
    const documentFn = vi.fn().mockReturnValue('<html></html>')
    await buildResponse({ page: makePage(), c: makeContext(), options: makeOptions({ document: documentFn }), isInertia: false })
    expect(documentFn).toHaveBeenCalledWith(expect.objectContaining({ ssr: null }))
  })

  it('passes null ssr to document renderer when SSR renderer is false', async () => {
    const documentFn = vi.fn().mockReturnValue('<html></html>')
    await buildResponse({ page: makePage(), c: makeContext(), options: makeOptions({ ssr: false, document: documentFn }), isInertia: false })
    expect(documentFn).toHaveBeenCalledWith(expect.objectContaining({ ssr: null }))
  })
})

describe('runSsr', () => {
  it('returns null when renderer is undefined', async () => {
    expect(await runSsr(undefined, makePage(), makeContext())).toBeNull()
  })

  it('returns null when renderer is false', async () => {
    expect(await runSsr(false, makePage(), makeContext())).toBeNull()
  })

  it('returns result from renderer', async () => {
    const renderer = vi.fn().mockResolvedValue({ body: '<p>hi</p>' } satisfies SsrResult)
    expect(await runSsr(renderer, makePage(), makeContext())).toEqual({ body: '<p>hi</p>' })
  })

  it('returns null when renderer throws', async () => {
    const renderer = vi.fn().mockRejectedValue(new Error('boom'))
    expect(await runSsr(renderer, makePage(), makeContext())).toBeNull()
  })

  it('returns null when renderer returns null', async () => {
    const renderer = vi.fn().mockResolvedValue(null)
    expect(await runSsr(renderer, makePage(), makeContext())).toBeNull()
  })
})

describe('renderInertiaRoot — basic output', () => {
  it('produces a div with id="app" and data-page by default', () => {
    const html = renderInertiaRoot(makePage({ component: 'Home' }))
    expect(html).toMatch(/^<div id="app" data-page="/)
    expect(html).toContain('&quot;component&quot;:&quot;Home&quot;')
    expect(html).toContain('</div>')
  })

  it('snapshot: full tag format matches v3 spec', () => {
    const page = makePage({ component: 'Home', url: '/', version: null })
    const html = renderInertiaRoot(page, { scriptSrc: '/build/app.js' })
    expect(html).toBe(`<div id="app" data-page="${html.match(/data-page="([^"]+)"/)![1]}"></div>\n<script type="module" src="/build/app.js"></script>`)
  })

  it('uses custom id when provided', () => {
    expect(renderInertiaRoot(makePage(), { id: 'root' })).toMatch(/^<div id="root"/)
  })
})

describe('renderInertiaRoot — HTML escaping', () => {
  it('escapes & < > \' " in JSON attribute value', () => {
    const page = makePage({ props: { errors: {}, evil: `<script>alert('xss' & "fun" > end)</script>` } })
    const html = renderInertiaRoot(page)
    expect(html).not.toContain('<script>')
    const match = html.match(/data-page="([^"]*)"/)
    expect(match).not.toBeNull()
    const parsed = JSON.parse(match![1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"'))
    expect(parsed.props.evil).toBe(`<script>alert('xss' & "fun" > end)</script>`)
  })

  it('escapes & character', () => {
    const html = renderInertiaRoot(makePage({ props: { errors: {}, q: 'a&b' } }))
    expect(html).toContain('&amp;')
    const match = html.match(/data-page="([^"]+)"/)
    expect(match).not.toBeNull()
    expect(match![1]).not.toMatch(/&(?!amp;|lt;|gt;|#39;|quot;)/)
  })

  it('escapes < character', () => {
    expect(renderInertiaRoot(makePage({ props: { errors: {}, q: 'a<b' } }))).toContain('&lt;')
  })

  it('escapes > character', () => {
    expect(renderInertiaRoot(makePage({ props: { errors: {}, q: 'a>b' } }))).toContain('&gt;')
  })

  it("escapes ' character", () => {
    expect(renderInertiaRoot(makePage({ props: { errors: {}, q: "it's" } }))).toContain('&#39;')
  })

  it('escapes " character', () => {
    expect(renderInertiaRoot(makePage({ props: { errors: {}, q: 'say "hi"' } }))).toContain('&quot;')
  })
})

describe('renderInertiaRoot — SSR body', () => {
  it('includes SSR body inside the div when ssr is provided', () => {
    const ssr: SsrResult = { body: '<app>Hello SSR</app>' }
    const html = renderInertiaRoot(makePage(), { ssr })
    expect(html).toContain('<app>Hello SSR</app>')
    expect(html).toMatch(/<div[^>]+>.*<app>Hello SSR<\/app>.*<\/div>/s)
  })

  it('empty div when ssr is null', () => {
    expect(renderInertiaRoot(makePage(), { ssr: null })).toMatch(/<div[^>]+><\/div>/)
  })
})

describe('renderInertiaRoot — script tag', () => {
  it('appends script tag when scriptSrc is provided', () => {
    expect(renderInertiaRoot(makePage(), { scriptSrc: '/build/app.js' })).toContain('<script type="module" src="/build/app.js"></script>')
  })

  it('does not append script tag when scriptSrc is absent', () => {
    expect(renderInertiaRoot(makePage())).not.toContain('<script')
  })
})

describe('SSR — deferredProps and head strings', () => {
  it('SSR renderer receives full page including deferredProps', async () => {
    const page: InertiaPage = makePage({ component: 'Posts', deferredProps: { default: ['comments', 'likes'] } })
    const ssrRenderer = vi.fn().mockResolvedValue({ body: '<app>posts</app>', head: ['<title>Posts</title>'] } satisfies SsrResult)
    await runSsr(ssrRenderer, page, makeContext())
    expect(ssrRenderer).toHaveBeenCalledWith(expect.objectContaining({ page: expect.objectContaining({ component: 'Posts', deferredProps: { default: ['comments', 'likes'] } }) }))
  })

  it('head strings from SSR result are passed to the document renderer', async () => {
    const ssrRenderer = vi.fn().mockResolvedValue({ body: '<app>content</app>', head: ['<title>My Page</title>', '<meta name="description" content="test">'] } satisfies SsrResult)
    const documentFn = vi.fn().mockImplementation(({ ssr }: { ssr: SsrResult | null }) => `<html><head>${(ssr?.head ?? []).join('')}</head><body>${ssr?.body ?? ''}</body></html>`)
    await buildResponse({ page: makePage({ deferredProps: { default: ['comments'] } }), c: makeContext(), options: makeOptions({ ssr: ssrRenderer, document: documentFn }), isInertia: false })
    expect(documentFn).toHaveBeenCalledWith(expect.objectContaining({ ssr: expect.objectContaining({ head: ['<title>My Page</title>', '<meta name="description" content="test">'] }) }))
  })

  it('head strings surface in the final HTML document output', async () => {
    const ssrRenderer = vi.fn().mockResolvedValue({ body: '<app>rendered</app>', head: ['<title>SSR Title</title>'] } satisfies SsrResult)
    const documentFn = ({ page, ssr }: { page: InertiaPage, ssr: SsrResult | null, c: Context }) => `<html><head>${(ssr?.head ?? []).join('')}</head><body>${renderInertiaRoot(page, { ssr })}</body></html>`
    const res = await buildResponse({ page: makePage({ component: 'Blog', deferredProps: { sidebar: ['tags'] } }), c: makeContext(), options: makeOptions({ ssr: ssrRenderer, document: documentFn }), isInertia: false })
    const html = await res.text()
    expect(html).toContain('<title>SSR Title</title>')
    expect(html).toContain('<app>rendered</app>')
    expect(html).toContain('&quot;component&quot;:&quot;Blog&quot;')
    expect(html).toContain('deferredProps')
  })

  it('renderInertiaRoot embeds deferredProps in data-page attribute', () => {
    const html = renderInertiaRoot(makePage({ component: 'Dashboard', deferredProps: { default: ['stats', 'chart'] } }))
    const match = html.match(/data-page="([^"]+)"/)
    expect(match).not.toBeNull()
    const parsed = JSON.parse(match![1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"'))
    expect(parsed.deferredProps).toEqual({ default: ['stats', 'chart'] })
  })
})
