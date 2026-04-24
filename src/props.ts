// ---------------------------------------------------------------------------
// Prop wrapper factories for Inertia.js deferred / merged props.
// ---------------------------------------------------------------------------

export type PropWrapperType = 'defer' | 'merge' | 'deepMerge' | 'optional' | 'always' | 'once'

export interface DeferredProp {
  _type: 'defer'
  fn: () => unknown | Promise<unknown>
  group?: string
}

export interface MergeProp {
  _type: 'merge'
  value: unknown
}

export interface DeepMergeProp {
  _type: 'deepMerge'
  value: unknown
}

export interface OptionalProp {
  _type: 'optional'
  fn: () => unknown | Promise<unknown>
}

export interface AlwaysProp {
  _type: 'always'
  fn: (() => unknown | Promise<unknown>) | unknown
}

export interface OnceProp {
  _type: 'once'
  fn: () => unknown | Promise<unknown>
  key: string
}

export type PropWrapper =
  | DeferredProp
  | MergeProp
  | DeepMergeProp
  | OptionalProp
  | AlwaysProp
  | OnceProp

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Marks a prop as deferred — it will be resolved in a separate request.
 * Optionally assign it to a named `group` so multiple deferred props can be
 * fetched in a single round-trip.
 */
export function defer(fn: () => unknown | Promise<unknown>, group?: string): DeferredProp {
  return { _type: 'defer', fn, group }
}

/**
 * Marks a prop value to be *shallow-merged* into the existing props on the
 * client instead of replacing them.
 */
export function merge(value: unknown): MergeProp {
  return { _type: 'merge', value }
}

/**
 * Marks a prop value to be *deep-merged* into the existing props on the
 * client instead of replacing them.
 */
export function deepMerge(value: unknown): DeepMergeProp {
  return { _type: 'deepMerge', value }
}

/**
 * Marks a prop as optional (lazy) — it is only evaluated when explicitly
 * requested (partial reload).
 */
export function optional(fn: () => unknown | Promise<unknown>): OptionalProp {
  return { _type: 'optional', fn }
}

/** Alias for {@link optional}. */
export const lazy = optional

/**
 * Marks a prop as *always* evaluated, even during partial reloads that do not
 * explicitly include this prop.  The argument may be a plain value or a
 * zero-argument factory function.
 */
export function always(fn: (() => unknown | Promise<unknown>) | unknown): AlwaysProp {
  return { _type: 'always', fn }
}

/**
 * Marks a prop as evaluated only once per session / cache key.  Subsequent
 * requests with the same `key` receive the cached value.
 */
export function once(fn: () => unknown | Promise<unknown>, key: string): OnceProp {
  return { _type: 'once', fn, key }
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

const PROP_WRAPPER_TYPES = new Set<PropWrapperType>([
  'defer',
  'merge',
  'deepMerge',
  'optional',
  'always',
  'once',
])

export function isPropWrapper(value: unknown): value is PropWrapper {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_type' in value &&
    PROP_WRAPPER_TYPES.has((value as { _type: unknown })._type as PropWrapperType)
  )
}
