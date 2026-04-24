import { describe, it, expect } from 'vitest'
import { assemblePageObject, createInMemoryOnceStore } from '../src/page.js'
import { defer, merge, deepMerge, always, once, optional } from '../src/props.js'

function makeRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers })
}

function makePartialRequest(url: string, component: string, partialData: string[]): Request {
  return makeRequest(url, {
    'x-inertia': 'true',
    'x-inertia-partial-component': component,
    'x-inertia-partial-data': partialData.join(','),
  })
}

const baseParams = {
  component: 'Dashboard',
  routeProps: {},
  globalSharedProps: {},
  requestSharedProps: {},
  errors: {},
  version: 'v1',
  request: makeRequest('http://localhost/dashboard'),
}

describe('defer() wrapper', () => {
  it('excludes deferred prop from props on full visit', async () => {
    const page = await assemblePageObject({ ...baseParams, routeProps: { title: 'Hello', heavyData: defer(async () => [1, 2, 3]) } })
    expect('heavyData' in page.props).toBe(false)
    expect(page.props.title).toBe('Hello')
  })

  it('adds deferred prop to deferredProps metadata under default group', async () => {
    const page = await assemblePageObject({ ...baseParams, routeProps: { heavyData: defer(() => 42) } })
    expect(page.deferredProps).toEqual({ default: ['heavyData'] })
  })

  it('adds deferred prop to deferredProps under named group', async () => {
    const page = await assemblePageObject({ ...baseParams, routeProps: { chart: defer(() => [], 'charts') } })
    expect(page.deferredProps).toEqual({ charts: ['chart'] })
  })

  it('groups multiple deferred props correctly', async () => {
    const page = await assemblePageObject({
      ...baseParams,
      routeProps: { a: defer(() => 1, 'group1'), b: defer(() => 2, 'group1'), c: defer(() => 3, 'group2') },
    })
    expect(page.deferredProps?.group1?.sort()).toEqual(['a', 'b'])
    expect(page.deferredProps?.group2).toEqual(['c'])
  })

  it('omits deferredProps from page when no deferred props exist', async () => {
    const page = await assemblePageObject({ ...baseParams, routeProps: { x: 1 } })
    expect(page.deferredProps).toBeUndefined()
  })
})

describe('merge() wrapper', () => {
  it('includes key in mergeProps metadata', async () => {
    const page = await assemblePageObject({ ...baseParams, routeProps: { list: merge([1, 2, 3]) } })
    expect(page.mergeProps).toContain('list')
  })

  it('resolves value into props', async () => {
    const page = await assemblePageObject({ ...baseParams, routeProps: { list: merge([1, 2, 3]) } })
    expect(page.props.list).toEqual([1, 2, 3])
  })

  it('omits mergeProps from page when no merge props exist', async () => {
    const page = await assemblePageObject({ ...baseParams, routeProps: { x: 1 } })
    expect(page.mergeProps).toBeUndefined()
  })
})

describe('deepMerge() wrapper', () => {
  it('includes key in deepMergeProps metadata', async () => {
    const page = await assemblePageObject({ ...baseParams, routeProps: { settings: deepMerge({ theme: 'dark' }) } })
    expect(page.deepMergeProps).toContain('settings')
  })

  it('resolves value into props', async () => {
    const page = await assemblePageObject({ ...baseParams, routeProps: { settings: deepMerge({ theme: 'dark' }) } })
    expect(page.props.settings).toEqual({ theme: 'dark' })
  })

  it('omits deepMergeProps from page when no deepMerge props exist', async () => {
    const page = await assemblePageObject({ ...baseParams, routeProps: { x: 1 } })
    expect(page.deepMergeProps).toBeUndefined()
  })
})

describe('always() wrapper', () => {
  it('includes always() prop even when partial-data excludes it', async () => {
    const req = makePartialRequest('http://localhost/dashboard', 'Dashboard', ['title'])
    const page = await assemblePageObject({ ...baseParams, request: req, routeProps: { title: 'Hello', sidebarCount: always(99) } })
    expect(page.props.title).toBe('Hello')
    expect(page.props.sidebarCount).toBe(99)
  })

  it('resolves always() with a factory function', async () => {
    const req = makePartialRequest('http://localhost/dashboard', 'Dashboard', ['title'])
    const page = await assemblePageObject({ ...baseParams, request: req, routeProps: { title: 'Hello', badge: always(() => 'new') } })
    expect(page.props.badge).toBe('new')
  })

  it('always() prop is also included on full visits', async () => {
    const page = await assemblePageObject({ ...baseParams, routeProps: { sidebarCount: always(5) } })
    expect(page.props.sidebarCount).toBe(5)
  })
})

describe('once() wrapper', () => {
  it('resolves once() prop value into props (basic resolution)', async () => {
    const onceStore = createInMemoryOnceStore()
    const page = await assemblePageObject({ ...baseParams, routeProps: { flash: once(() => 'Welcome!', 'flash-msg') }, onceStore })
    expect(page.props.flash).toBe('Welcome!')
  })

  it('returns null on the second request (already delivered)', async () => {
    const onceStore = createInMemoryOnceStore()
    const params = { ...baseParams, routeProps: { flash: once(() => 'Welcome!', 'flash-key') }, onceStore }
    expect((await assemblePageObject(params)).props.flash).toBe('Welcome!')
    expect((await assemblePageObject(params)).props.flash).toBeNull()
  })

  it('re-delivers the value after X-Inertia-Reset with the matching key', async () => {
    const onceStore = createInMemoryOnceStore()
    const params = { ...baseParams, routeProps: { flash: once(() => 'Welcome!', 'flash-reset-key') }, onceStore }
    expect((await assemblePageObject(params)).props.flash).toBe('Welcome!')
    expect((await assemblePageObject(params)).props.flash).toBeNull()
    expect((await assemblePageObject({ ...params, resetKeys: ['flash-reset-key'] })).props.flash).toBe('Welcome!')
  })

  it('does not re-deliver if reset key does not match', async () => {
    const onceStore = createInMemoryOnceStore()
    const params = { ...baseParams, routeProps: { flash: once(() => 'Hi', 'my-key') }, onceStore }
    await assemblePageObject(params)
    expect((await assemblePageObject({ ...params, resetKeys: ['other-key'] })).props.flash).toBeNull()
  })
})

describe('optional() / lazy() wrapper', () => {
  it('resolves optional prop when included in full visit', async () => {
    const page = await assemblePageObject({ ...baseParams, routeProps: { expensiveData: optional(async () => [1, 2]) } })
    expect(page.props.expensiveData).toEqual([1, 2])
  })

  it('optional prop excluded from props during partial reload when not in partial-data', async () => {
    const req = makePartialRequest('http://localhost/dashboard', 'Dashboard', ['title'])
    const page = await assemblePageObject({
      ...baseParams,
      request: req,
      routeProps: { title: 'Hello', expensiveData: optional(() => [1, 2]) },
    })
    expect('expensiveData' in page.props).toBe(false)
    expect(page.props.title).toBe('Hello')
  })
})

describe('sharedProps tracking', () => {
  it('includes keys from globalSharedProps in sharedProps', async () => {
    const page = await assemblePageObject({ ...baseParams, globalSharedProps: { appName: 'MyApp', locale: 'en' }, routeProps: { title: 'Page' } })
    expect(page.sharedProps).toContain('appName')
    expect(page.sharedProps).toContain('locale')
    expect(page.sharedProps).not.toContain('title')
  })

  it('includes keys from requestSharedProps in sharedProps', async () => {
    const page = await assemblePageObject({ ...baseParams, requestSharedProps: { user: { id: 1 } }, routeProps: { title: 'Page' } })
    expect(page.sharedProps).toContain('user')
    expect(page.sharedProps).not.toContain('title')
  })

  it('omits sharedProps field when no shared props exist', async () => {
    const page = await assemblePageObject({ ...baseParams, routeProps: { x: 1 } })
    expect(page.sharedProps).toBeUndefined()
  })

  it('includes shared key overridden by routeProps in sharedProps', async () => {
    const page = await assemblePageObject({ ...baseParams, globalSharedProps: { title: 'Global' }, routeProps: { title: 'Route' } })
    expect(page.sharedProps).toContain('title')
  })
})

describe('plain prop resolution', () => {
  it('resolves async function prop values', async () => {
    const page = await assemblePageObject({ ...baseParams, routeProps: { count: async () => 42 } })
    expect(page.props.count).toBe(42)
  })

  it('resolves synchronous function prop values', async () => {
    const page = await assemblePageObject({ ...baseParams, routeProps: { count: () => 7 } })
    expect(page.props.count).toBe(7)
  })

  it('passes plain values through unchanged', async () => {
    const page = await assemblePageObject({ ...baseParams, routeProps: { name: 'Alice', age: 30 } })
    expect(page.props.name).toBe('Alice')
    expect(page.props.age).toBe(30)
  })
})

describe('preserveFragment and preserveScroll', () => {
  it('does not include preserveFragment or preserveScroll when not set', async () => {
    const page = await assemblePageObject({ ...baseParams })
    expect('preserveFragment' in page).toBe(false)
    expect('preserveScroll' in page).toBe(false)
  })

  it('sets preserveFragment when true', async () => {
    expect((await assemblePageObject({ ...baseParams, preserveFragment: true })).preserveFragment).toBe(true)
  })

  it('sets preserveFragment when false', async () => {
    expect((await assemblePageObject({ ...baseParams, preserveFragment: false })).preserveFragment).toBe(false)
  })

  it('sets preserveScroll when true', async () => {
    expect((await assemblePageObject({ ...baseParams, preserveScroll: true })).preserveScroll).toBe(true)
  })

  it('sets preserveScroll when false', async () => {
    expect((await assemblePageObject({ ...baseParams, preserveScroll: false })).preserveScroll).toBe(false)
  })

  it('sets both independently', async () => {
    const page = await assemblePageObject({ ...baseParams, preserveFragment: true, preserveScroll: false })
    expect(page.preserveFragment).toBe(true)
    expect(page.preserveScroll).toBe(false)
  })
})
