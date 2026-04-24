import Elysia, { Context } from 'elysia';

type PropWrapperType = 'defer' | 'merge' | 'deepMerge' | 'optional' | 'always' | 'once';
interface DeferredProp {
    _type: 'defer';
    fn: () => unknown | Promise<unknown>;
    group?: string;
}
interface MergeProp {
    _type: 'merge';
    value: unknown;
}
interface DeepMergeProp {
    _type: 'deepMerge';
    value: unknown;
}
interface OptionalProp {
    _type: 'optional';
    fn: () => unknown | Promise<unknown>;
}
interface AlwaysProp {
    _type: 'always';
    fn: (() => unknown | Promise<unknown>) | unknown;
}
interface OnceProp {
    _type: 'once';
    fn: () => unknown | Promise<unknown>;
    key: string;
}
type PropWrapper = DeferredProp | MergeProp | DeepMergeProp | OptionalProp | AlwaysProp | OnceProp;
/**
 * Marks a prop as deferred — it will be resolved in a separate request.
 * Optionally assign it to a named `group` so multiple deferred props can be
 * fetched in a single round-trip.
 */
declare function defer(fn: () => unknown | Promise<unknown>, group?: string): DeferredProp;
/**
 * Marks a prop value to be *shallow-merged* into the existing props on the
 * client instead of replacing them.
 */
declare function merge(value: unknown): MergeProp;
/**
 * Marks a prop value to be *deep-merged* into the existing props on the
 * client instead of replacing them.
 */
declare function deepMerge(value: unknown): DeepMergeProp;
/**
 * Marks a prop as optional (lazy) — it is only evaluated when explicitly
 * requested (partial reload).
 */
declare function optional(fn: () => unknown | Promise<unknown>): OptionalProp;
/** Alias for {@link optional}. */
declare const lazy: typeof optional;
/**
 * Marks a prop as *always* evaluated, even during partial reloads that do not
 * explicitly include this prop.  The argument may be a plain value or a
 * zero-argument factory function.
 */
declare function always(fn: (() => unknown | Promise<unknown>) | unknown): AlwaysProp;
/**
 * Marks a prop as evaluated only once per session / cache key.  Subsequent
 * requests with the same `key` receive the cached value.
 */
declare function once(fn: () => unknown | Promise<unknown>, key: string): OnceProp;
declare function isPropWrapper(value: unknown): value is PropWrapper;

type MaybePromise<T> = T | Promise<T>;
type PageProps = Record<string, unknown>;
type ErrorBag = Record<string, string | string[]>;
interface InertiaPage<Props extends PageProps = PageProps> {
    component: string;
    props: Props & {
        errors: ErrorBag;
    };
    url: string;
    version: string | null;
    clearHistory?: boolean;
    encryptHistory?: boolean;
    preserveFragment?: boolean;
    preserveScroll?: boolean;
    /** Deferred prop groups: group name → array of prop keys */
    deferredProps?: Record<string, string[]>;
    /** Keys whose values should be shallow-merged on the client */
    mergeProps?: string[];
    /** Keys whose values should be deep-merged on the client */
    deepMergeProps?: string[];
    /** Keys that originated from global or per-request shared props */
    sharedProps?: string[];
}
interface RenderOptions {
    status?: number;
    headers?: HeadersInit;
    clearHistory?: boolean;
    encryptHistory?: boolean;
    preserveFragment?: boolean;
    preserveScroll?: boolean;
}
interface SsrResult {
    body: string;
    head?: string[];
}
type SsrRenderer = (input: {
    page: InertiaPage;
    c: Context;
}) => MaybePromise<SsrResult | null>;
interface DocumentRenderer {
    (input: {
        page: InertiaPage;
        c: Context;
        ssr: SsrResult | null;
    }): MaybePromise<string | Response>;
}
/**
 * Pluggable store that tracks which `once()` prop keys have already been
 * delivered to the client.  The default implementation is an in-memory Map.
 * For multi-process or multi-server deployments you can supply a Redis-backed
 * (or any other) implementation by passing `onceStore` to `inertia()`.
 */
interface OnceStore {
    has(key: string): boolean | Promise<boolean>;
    set(key: string): void | Promise<void>;
    delete(key: string): void | Promise<void>;
}
interface InertiaOptions<Shared extends PageProps = PageProps> {
    document: DocumentRenderer;
    share?: (c: Context) => MaybePromise<Shared>;
    version?: string | ((c: Context) => MaybePromise<string | null>);
    resolveErrors?: (c: Context) => MaybePromise<ErrorBag>;
    ssr?: false | SsrRenderer;
    /**
     * Custom store for tracking delivered `once()` props.
     * Defaults to a module-level in-memory Map (suitable for single-process use).
     */
    onceStore?: OnceStore;
}
interface InertiaFacade {
    render<Props extends PageProps>(component: string, props?: Props, options?: RenderOptions): Promise<Response>;
    share(props: PageProps | ((c: Context) => MaybePromise<PageProps>)): void;
    location(url: string): Response;
    redirect(url: string): Response;
    isInertiaRequest(): boolean;
    /**
     * Returns `true` when the request was sent with the `Purpose: prefetch`
     * header, indicating the browser may pre-load the response without the user
     * having navigated yet.
     */
    isPrefetch(): boolean;
}

/**
 * Creates a fresh in-memory OnceStore.
 * Tests should create a new instance per test to avoid state leakage.
 */
declare function createInMemoryOnceStore(): OnceStore;

interface RenderInertiaRootOptions {
    /** The element id. Defaults to `'app'`. */
    id?: string;
    /** If provided, the SSR body is rendered inside the div. */
    ssr?: SsrResult | null;
    /** If provided, a `<script type="module" src="...">` tag is appended. */
    scriptSrc?: string;
}
/**
 * Build the Inertia v3 bootstrap HTML fragment:
 *
 * ```html
 * <div id="app" data-page="{escaped JSON}"><!-- SSR body --></div>
 * <script type="module" src="/build/app.js"></script>
 * ```
 */
declare function renderInertiaRoot(page: InertiaPage, options?: RenderInertiaRootOptions): string;

interface InertiaRequestState {
    /** Props shared for the current request via facade.share(). */
    sharedProps: Array<PageProps | ((request: Request) => MaybePromise<PageProps>)>;
    /**
     * Whether the current request was issued with `Purpose: prefetch`.
     * When true, side-effects (e.g. analytics, flash consumption) should be
     * skipped because the browser may never actually navigate to the page.
     */
    isPrefetch: boolean;
}

interface InertiaHeaders {
    inertia: boolean;
    version: string | null;
    partialComponent: string | null;
    partialData: string[];
    partialExcept: string[];
    reset: string[];
    prefetch: boolean;
    errorBag: string | null;
}

declare function inertia<Shared extends PageProps = PageProps>(options: InertiaOptions<Shared>): Elysia<"", {
    decorator: {};
    store: {};
    derive: {};
    resolve: {};
}, {
    typebox: {};
    error: {};
}, {
    schema: {};
    standaloneSchema: {};
    macro: {};
    macroFn: {};
    parser: {};
    response: {};
}, {}, {
    derive: {
        readonly _inertiaState: InertiaRequestState;
        readonly _inertiaHeaders: InertiaHeaders;
    };
    resolve: {
        readonly inertia: InertiaFacade;
    };
    schema: {};
    standaloneSchema: {};
    response: {
        200: Response;
    };
}, {
    derive: {};
    resolve: {};
    schema: {};
    standaloneSchema: {};
    response: {};
}>;

/**
 * Elysia Precognition plugin
 *
 * ## API difference from the Hono version
 *
 * Hono:  `app.use('/route', precognition({ validate }))`
 *   – a plain middleware inserted before the real handler.
 *
 * Elysia: `app.use(precognition({ validate }))`
 *   – an Elysia plugin that registers a global `onBeforeHandle` hook.
 *     Because Elysia's lifecycle hooks are additive, you mount the plugin once
 *     on the app (or a scoped group) and it inspects every request that passes
 *     through that scope.  Non-Precognition requests are left untouched and
 *     fall through to the real route handler as normal.
 *
 * The `validate` callback receives the raw Elysia `Context` and the parsed
 * `fields` array (from the `Precognition-Validate-Only` header), matching the
 * Hono version's signature 1-to-1 except the first argument is an Elysia
 * `Context` instead of a Hono `Context`.
 */

interface PrecognitionOptions {
    /**
     * Called only for requests carrying the `Precognition: true` header.
     *
     * Return a non-empty errors object to produce a 422 response; return
     * `null`, `undefined`, or an empty object to signal success (204).
     */
    validate: (c: Context, fields: string[]) => MaybePromise<Record<string, string | string[]> | null | undefined>;
}
/**
 * Mount this plugin on an Elysia app (or scoped group) to handle Laravel
 * Precognition preflight requests.
 *
 * ```ts
 * app.use(
 *   precognition({
 *     validate: async (c, fields) => {
 *       // run your validation; return errors or null
 *       return null
 *     },
 *   })
 * )
 * ```
 */
declare function precognition(options: PrecognitionOptions): Elysia<"", {
    decorator: {};
    store: {};
    derive: {};
    resolve: {};
}, {
    typebox: {};
    error: {};
}, {
    schema: {};
    standaloneSchema: {};
    macro: {};
    macroFn: {};
    parser: {};
    response: {};
}, {}, {
    derive: {};
    resolve: {};
    schema: {};
    standaloneSchema: {};
    response: {
        200: Response;
    };
}, {
    derive: {};
    resolve: {};
    schema: {};
    standaloneSchema: {};
    response: {};
}>;

export { type AlwaysProp, type DeepMergeProp, type DeferredProp, type DocumentRenderer, type ErrorBag, type InertiaFacade, type InertiaOptions, type InertiaPage, type InertiaRequestState, type MaybePromise, type MergeProp, type OnceProp, type OnceStore, type OptionalProp, type PageProps, type PrecognitionOptions, type PropWrapper, type PropWrapperType, type RenderInertiaRootOptions, type RenderOptions, type SsrRenderer, type SsrResult, always, createInMemoryOnceStore, deepMerge, defer, inertia, isPropWrapper, lazy, merge, once, optional, precognition, renderInertiaRoot };
