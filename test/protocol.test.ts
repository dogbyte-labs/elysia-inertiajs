import { describe, it, expect } from 'vitest'
import {
  isInertiaRequest,
  checkVersionMismatch,
  filterPartialProps,
  normalizeUrl,
  parseInertiaHeaders,
  makeLocationResponse,
  makeRedirectResponse,
  getPath,
  hasPath,
  setPath,
} from '../src/protocol.js'
import { assemblePageObject } from '../src/page.js'

function makeRequest(
  url: string,
  headers: Record<string, string> = {},
  method = 'GET',
): Request {
  return new Request(url, { method, headers })
}

describe('isInertiaRequest', () => {
  it('returns true when X-Inertia: true', () => {
    expect(isInertiaRequest(makeRequest('http://localhost/', { 'x-inertia': 'true' }))).toBe(true)
  })

  it('returns false when header is absent', () => {
    expect(isInertiaRequest(makeRequest('http://localhost/'))).toBe(false)
  })

  it('returns false when header is not exactly "true"', () => {
    expect(isInertiaRequest(makeRequest('http://localhost/', { 'x-inertia': '1' }))).toBe(false)
  })
})

describe('checkVersionMismatch', () => {
  it('returns false when versions match', () => {
    expect(checkVersionMismatch(makeRequest('http://localhost/'), 'abc', 'abc')).toBe(false)
  })

  it('returns true when versions differ on GET', () => {
    expect(checkVersionMismatch(makeRequest('http://localhost/'), 'old', 'new')).toBe(true)
  })

  it('returns false when client version is null', () => {
    expect(checkVersionMismatch(makeRequest('http://localhost/'), null, 'new')).toBe(false)
  })

  it('returns false when server version is null', () => {
    expect(checkVersionMismatch(makeRequest('http://localhost/'), 'old', null)).toBe(false)
  })

  it('returns false on non-GET even when versions differ', () => {
    expect(checkVersionMismatch(makeRequest('http://localhost/', {}, 'POST'), 'old', 'new')).toBe(false)
  })
})

describe('filterPartialProps', () => {
  const props = { a: 1, b: 2, c: 3, errors: {} }

  it('returns all props when both lists are empty', () => {
    expect(filterPartialProps(props, [], [])).toEqual(props)
  })

  it('keeps only listed keys in partialData but always includes errors', () => {
    expect(filterPartialProps(props, ['a', 'c'], [])).toEqual({ a: 1, c: 3, errors: {} })
  })

  it('excludes keys in partialExcept but always includes errors', () => {
    expect(filterPartialProps(props, [], ['b'])).toEqual({ a: 1, c: 3, errors: {} })
  })

  it('applies partialData first, then partialExcept, errors always included', () => {
    expect(filterPartialProps(props, ['a', 'b'], ['b'])).toEqual({ a: 1, errors: {} })
  })

  it('returns only errors when partialData lists no matching keys', () => {
    expect(filterPartialProps(props, ['z'], [])).toEqual({ errors: {} })
  })

  it('partialExcept wins over partialData; errors always included', () => {
    const p = { foo: 1, bar: 2, baz: 3, errors: { name: 'required' } }
    expect(filterPartialProps(p, ['foo', 'errors', 'bar'], ['bar'])).toEqual({
      foo: 1,
      errors: { name: 'required' },
    })
  })

  it('errors always included even when excluded via partialExcept', () => {
    const p = { a: 1, errors: { x: 'bad' } }
    expect(filterPartialProps(p, [], ['errors'])).toEqual({ a: 1, errors: { x: 'bad' } })
  })
})

describe('normalizeUrl', () => {
  it('returns pathname only for simple URL', () => {
    expect(normalizeUrl(makeRequest('http://localhost/dashboard'))).toBe('/dashboard')
  })

  it('includes query string', () => {
    expect(normalizeUrl(makeRequest('http://localhost/search?q=cats'))).toBe('/search?q=cats')
  })

  it('strips origin and hash', () => {
    expect(normalizeUrl(makeRequest('http://example.com/foo?bar=1'))).toBe('/foo?bar=1')
  })

  it('handles root path', () => {
    expect(normalizeUrl(makeRequest('http://localhost/'))).toBe('/')
  })
})

describe('parseInertiaHeaders', () => {
  it('parses all inertia headers', () => {
    const parsed = parseInertiaHeaders(makeRequest('http://localhost/', {
      'x-inertia': 'true',
      'x-inertia-version': 'v1',
      'x-inertia-partial-component': 'Dashboard',
      'x-inertia-partial-data': 'user, posts',
      'x-inertia-partial-except': 'notifications',
    }))
    expect(parsed.inertia).toBe(true)
    expect(parsed.version).toBe('v1')
    expect(parsed.partialComponent).toBe('Dashboard')
    expect(parsed.partialData).toEqual(['user', 'posts'])
    expect(parsed.partialExcept).toEqual(['notifications'])
  })

  it('returns empty arrays and nulls when headers absent', () => {
    const parsed = parseInertiaHeaders(makeRequest('http://localhost/'))
    expect(parsed.inertia).toBe(false)
    expect(parsed.version).toBeNull()
    expect(parsed.partialComponent).toBeNull()
    expect(parsed.partialData).toEqual([])
    expect(parsed.partialExcept).toEqual([])
    expect(parsed.reset).toEqual([])
    expect(parsed.prefetch).toBe(false)
    expect(parsed.errorBag).toBeNull()
  })

  it('parses x-inertia-reset as string array', () => {
    expect(parseInertiaHeaders(makeRequest('http://localhost/', { 'x-inertia-reset': 'foo, bar, baz' })).reset).toEqual(['foo', 'bar', 'baz'])
  })

  it('returns empty reset array when header absent', () => {
    expect(parseInertiaHeaders(makeRequest('http://localhost/')).reset).toEqual([])
  })

  it('sets prefetch true when Purpose: prefetch', () => {
    expect(parseInertiaHeaders(makeRequest('http://localhost/', { purpose: 'prefetch' })).prefetch).toBe(true)
  })

  it('sets prefetch false when Purpose has other value', () => {
    expect(parseInertiaHeaders(makeRequest('http://localhost/', { purpose: 'other' })).prefetch).toBe(false)
  })

  it('parses x-inertia-error-bag as string', () => {
    expect(parseInertiaHeaders(makeRequest('http://localhost/', { 'x-inertia-error-bag': 'loginForm' })).errorBag).toBe('loginForm')
  })

  it('returns null errorBag when header absent', () => {
    expect(parseInertiaHeaders(makeRequest('http://localhost/')).errorBag).toBeNull()
  })
})

describe('makeLocationResponse', () => {
  it('returns 409 with X-Inertia-Location header', () => {
    const res = makeLocationResponse('/new-path')
    expect(res.status).toBe(409)
    expect(res.headers.get('x-inertia-location')).toBe('/new-path')
  })
})

describe('assemblePageObject', () => {
  const baseRequest = makeRequest('http://localhost/home')
  const baseParams = {
    component: 'Home',
    routeProps: { title: 'Home' },
    globalSharedProps: { appName: 'Dogbyte Labs' },
    requestSharedProps: { user: { id: 1 } },
    errors: { name: 'required' },
    version: 'v1',
    request: baseRequest,
  }

  it('merges all prop sources in correct order', async () => {
    const page = await assemblePageObject(baseParams)
    expect(page.component).toBe('Home')
    expect(page.url).toBe('/home')
    expect(page.version).toBe('v1')
    expect(page.props.appName).toBe('Dogbyte Labs')
    expect(page.props.user).toEqual({ id: 1 })
    expect(page.props.errors).toEqual({ name: 'required' })
    expect(page.props.title).toBe('Home')
  })

  it('routeProps override shared props on collision', async () => {
    const page = await assemblePageObject({ ...baseParams, globalSharedProps: { title: 'Global Title' }, routeProps: { title: 'Route Title' } })
    expect(page.props.title).toBe('Route Title')
  })

  it('requestSharedProps override globalSharedProps on collision', async () => {
    const page = await assemblePageObject({ ...baseParams, globalSharedProps: { theme: 'light' }, requestSharedProps: { theme: 'dark' }, routeProps: {} })
    expect(page.props.theme).toBe('dark')
  })

  it('applies partial reload filtering when component matches', async () => {
    const req = makeRequest('http://localhost/home', {
      'x-inertia': 'true',
      'x-inertia-partial-component': 'Home',
      'x-inertia-partial-data': 'title',
    })
    const page = await assemblePageObject({ ...baseParams, request: req })
    expect(Object.keys(page.props).sort()).toEqual(['errors', 'title'])
    expect(page.props.title).toBe('Home')
  })

  it('skips partial filtering when component does not match', async () => {
    const req = makeRequest('http://localhost/home', {
      'x-inertia': 'true',
      'x-inertia-partial-component': 'Other',
      'x-inertia-partial-data': 'title',
    })
    const page = await assemblePageObject({ ...baseParams, request: req })
    expect(page.props.appName).toBe('Dogbyte Labs')
    expect(page.props.title).toBe('Home')
  })

  it('includes clearHistory and encryptHistory when provided', async () => {
    const page = await assemblePageObject({ ...baseParams, clearHistory: true, encryptHistory: false })
    expect(page.clearHistory).toBe(true)
    expect(page.encryptHistory).toBe(false)
  })

  it('omits clearHistory/encryptHistory when not provided', async () => {
    const page = await assemblePageObject(baseParams)
    expect(page.clearHistory).toBeUndefined()
    expect(page.encryptHistory).toBeUndefined()
  })

  it('sets version to null when provided', async () => {
    const page = await assemblePageObject({ ...baseParams, version: null })
    expect(page.version).toBeNull()
  })
})

describe('getPath / hasPath / setPath', () => {
  const obj = { user: { profile: { name: 'Alice', age: 30 }, email: 'alice@example.com' }, items: ['a', 'b'] }

  it('returns top-level value', () => {
    expect(getPath(obj, 'user')).toEqual(obj.user)
  })

  it('returns deeply nested value', () => {
    expect(getPath(obj, 'user.profile.name')).toBe('Alice')
  })

  it('returns undefined for missing path', () => {
    expect(getPath(obj, 'user.missing.key')).toBeUndefined()
  })

  it('returns undefined when intermediate is not an object', () => {
    expect(getPath(obj, 'user.profile.name.extra')).toBeUndefined()
  })

  it('accesses array index as string key', () => {
    expect(getPath(obj, 'items.0')).toBe('a')
  })

  it('returns true for existing path', () => {
    expect(hasPath({ user: { profile: { name: 'Alice' } } }, 'user.profile.name')).toBe(true)
  })

  it('returns false for missing path', () => {
    expect(hasPath({ user: { profile: { name: 'Alice' } } }, 'user.profile.age')).toBe(false)
  })

  it('returns true for top-level key', () => {
    expect(hasPath({ user: { profile: { name: 'Alice' } } }, 'user')).toBe(true)
  })

  it('sets a top-level key', () => {
    expect(setPath({}, 'name', 'Alice')).toEqual({ name: 'Alice' })
  })

  it('sets a deeply nested path (creates intermediates)', () => {
    expect(setPath({}, 'user.profile.name', 'Alice')).toEqual({ user: { profile: { name: 'Alice' } } })
  })

  it('merges with existing structure', () => {
    const base = { user: { profile: { name: 'Alice' }, email: 'a@b.com' } }
    expect(setPath(base as Record<string, unknown>, 'user.profile.age', 30)).toEqual({ user: { profile: { name: 'Alice', age: 30 }, email: 'a@b.com' } })
  })
})

describe('filterPartialProps dot-path', () => {
  const props = {
    user: { profile: { name: 'Alice', bio: 'Dev' }, email: 'alice@example.com' },
    settings: { theme: 'dark' },
    items: ['x', 'y', 'z'],
    errors: {},
  }

  it('deep include: partialData with dot-path includes only the nested subtree', () => {
    const result = filterPartialProps(props, ['user.profile'], [])
    expect(result).toEqual({ user: { profile: { name: 'Alice', bio: 'Dev' } }, errors: {} })
    expect((result.user as Record<string, unknown>)?.email).toBeUndefined()
  })

  it('deep exclude: partialExcept with dot-path removes only the nested key', () => {
    const result = filterPartialProps(props, [], ['user.email'])
    expect(result.user).toEqual({ profile: { name: 'Alice', bio: 'Dev' } })
    expect(result.settings).toEqual({ theme: 'dark' })
    expect(result.errors).toEqual({})
  })

  it('mixed: top-level + dot-path in same partialData', () => {
    expect(filterPartialProps(props, ['settings', 'user.profile'], [])).toEqual({
      settings: { theme: 'dark' },
      user: { profile: { name: 'Alice', bio: 'Dev' } },
      errors: {},
    })
  })

  it('mixed: top-level + dot-path in same partialExcept', () => {
    const result = filterPartialProps(props, [], ['settings', 'user.email'])
    expect(result.settings).toBeUndefined()
    expect((result.user as Record<string, unknown>)?.email).toBeUndefined()
    expect((result.user as Record<string, unknown>)?.profile).toBeDefined()
    expect(result.errors).toEqual({})
  })

  it('array index: partialData with items.0 returns only first element subtree', () => {
    expect(filterPartialProps(props, ['items.0'], [])).toEqual({ items: { '0': 'x' }, errors: {} })
  })

  it('errors always included when deep-filtered out', () => {
    const p = { user: { email: 'a@b.com' }, errors: { email: 'bad' } }
    expect(filterPartialProps(p, ['user.email'], [])).toEqual({ user: { email: 'a@b.com' }, errors: { email: 'bad' } })
  })
})

describe('makeRedirectResponse', () => {
  it('returns 409 with X-Inertia-Redirect header when fragment option is true', () => {
    const res = makeRedirectResponse('/path#section', { fragment: true })
    expect(res.status).toBe(409)
    expect(res.headers.get('x-inertia-redirect')).toBe('/path#section')
  })

  it('returns 409 with X-Inertia-Redirect header when URL contains a hash', () => {
    const res = makeRedirectResponse('/path#section')
    expect(res.status).toBe(409)
    expect(res.headers.get('x-inertia-redirect')).toBe('/path#section')
  })

  it('returns 302 with Location header for non-fragment redirect', () => {
    const res = makeRedirectResponse('/dashboard')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/dashboard')
    expect(res.headers.get('x-inertia-redirect')).toBeNull()
  })

  it('returns 302 when fragment is false and URL has no hash', () => {
    const res = makeRedirectResponse('/dashboard', { fragment: false })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/dashboard')
  })
})
