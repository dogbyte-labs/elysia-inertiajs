import { describe, it, expect } from 'vitest'
import {
  defer,
  merge,
  deepMerge,
  optional,
  lazy,
  always,
  once,
  isPropWrapper,
} from '../src/props.js'
import type {
  DeferredProp,
  MergeProp,
  DeepMergeProp,
  OptionalProp,
  AlwaysProp,
  OnceProp,
} from '../src/props.js'

describe('defer()', () => {
  it('returns a DeferredProp with _type "defer"', () => {
    const fn = () => 42
    const result = defer(fn)
    expect(result._type).toBe('defer')
    expect(result.fn).toBe(fn)
  })

  it('stores an optional group', () => {
    const result = defer(() => 'data', 'myGroup')
    expect(result.group).toBe('myGroup')
  })

  it('group is undefined when omitted', () => {
    expect(defer(() => 'data').group).toBeUndefined()
  })

  it('satisfies DeferredProp type', () => {
    const result: DeferredProp = defer(() => null)
    expect(result._type).toBe('defer')
  })
})

describe('merge()', () => {
  it('returns a MergeProp with _type "merge"', () => {
    const result = merge({ a: 1 })
    expect(result._type).toBe('merge')
    expect(result.value).toEqual({ a: 1 })
  })

  it('satisfies MergeProp type', () => {
    const result: MergeProp = merge('hello')
    expect(result._type).toBe('merge')
  })
})

describe('deepMerge()', () => {
  it('returns a DeepMergeProp with _type "deepMerge"', () => {
    const result = deepMerge({ nested: { x: 1 } })
    expect(result._type).toBe('deepMerge')
    expect(result.value).toEqual({ nested: { x: 1 } })
  })

  it('satisfies DeepMergeProp type', () => {
    const result: DeepMergeProp = deepMerge(42)
    expect(result._type).toBe('deepMerge')
  })
})

describe('optional()', () => {
  it('returns an OptionalProp with _type "optional"', () => {
    const fn = () => 'value'
    const result = optional(fn)
    expect(result._type).toBe('optional')
    expect(result.fn).toBe(fn)
  })

  it('satisfies OptionalProp type', () => {
    const result: OptionalProp = optional(() => null)
    expect(result._type).toBe('optional')
  })
})

describe('lazy (alias for optional)', () => {
  it('is the same function reference as optional', () => {
    expect(lazy).toBe(optional)
  })

  it('produces an OptionalProp', () => {
    expect(lazy(() => 'lazy value')._type).toBe('optional')
  })
})

describe('always()', () => {
  it('returns an AlwaysProp with _type "always" for a function', () => {
    const fn = () => 'data'
    const result = always(fn)
    expect(result._type).toBe('always')
    expect(result.fn).toBe(fn)
  })

  it('returns an AlwaysProp with _type "always" for a plain value', () => {
    const result = always(99)
    expect(result._type).toBe('always')
    expect(result.fn).toBe(99)
  })

  it('satisfies AlwaysProp type', () => {
    const result: AlwaysProp = always('static')
    expect(result._type).toBe('always')
  })
})

describe('once()', () => {
  it('returns an OnceProp with _type "once"', () => {
    const fn = () => 'cached'
    const result = once(fn, 'my-key')
    expect(result._type).toBe('once')
    expect(result.fn).toBe(fn)
    expect(result.key).toBe('my-key')
  })

  it('satisfies OnceProp type', () => {
    const result: OnceProp = once(() => null, 'k')
    expect(result._type).toBe('once')
  })
})

describe('isPropWrapper()', () => {
  it('returns true for all wrapper types', () => {
    expect(isPropWrapper(defer(() => null))).toBe(true)
    expect(isPropWrapper(merge({}))).toBe(true)
    expect(isPropWrapper(deepMerge({}))).toBe(true)
    expect(isPropWrapper(optional(() => null))).toBe(true)
    expect(isPropWrapper(always('x'))).toBe(true)
    expect(isPropWrapper(once(() => null, 'k'))).toBe(true)
  })

  it('returns false for plain objects without _type', () => {
    expect(isPropWrapper({ value: 1 })).toBe(false)
  })

  it('returns false for objects with unknown _type', () => {
    expect(isPropWrapper({ _type: 'unknown' })).toBe(false)
  })

  it('returns false for primitives', () => {
    expect(isPropWrapper(null)).toBe(false)
    expect(isPropWrapper(42)).toBe(false)
    expect(isPropWrapper('defer')).toBe(false)
  })
})
