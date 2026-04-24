// Public entry-point for elysia-inertia.

export type {
  MaybePromise,
  PageProps,
  ErrorBag,
  InertiaPage,
  RenderOptions,
  SsrResult,
  SsrRenderer,
  DocumentRenderer,
  InertiaOptions,
  InertiaFacade,
  PropWrapperType,
  PropWrapper,
  DeferredProp,
  MergeProp,
  DeepMergeProp,
  OptionalProp,
  AlwaysProp,
  OnceProp,
  OnceStore,
} from './types.js'

export { defer, merge, deepMerge, optional, lazy, always, once, isPropWrapper } from './props.js'
export { createInMemoryOnceStore } from './page.js'
export { renderInertiaRoot } from './document.js'
export type { RenderInertiaRootOptions } from './document.js'

export type { InertiaRequestState } from './context.js'

export { inertia } from './middleware.js'

export { precognition } from './precognition.js'
export type { PrecognitionOptions } from './precognition.js'
