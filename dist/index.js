// src/props.ts
function defer(fn, group) {
  return { _type: "defer", fn, group };
}
function merge(value) {
  return { _type: "merge", value };
}
function deepMerge(value) {
  return { _type: "deepMerge", value };
}
function optional(fn) {
  return { _type: "optional", fn };
}
var lazy = optional;
function always(fn) {
  return { _type: "always", fn };
}
function once(fn, key) {
  return { _type: "once", fn, key };
}
var PROP_WRAPPER_TYPES = /* @__PURE__ */ new Set([
  "defer",
  "merge",
  "deepMerge",
  "optional",
  "always",
  "once"
]);
function isPropWrapper(value) {
  return typeof value === "object" && value !== null && "_type" in value && PROP_WRAPPER_TYPES.has(value._type);
}

// src/protocol.ts
var HEADER_INERTIA = "x-inertia";
var HEADER_VERSION = "x-inertia-version";
var HEADER_PARTIAL_COMPONENT = "x-inertia-partial-component";
var HEADER_PARTIAL_DATA = "x-inertia-partial-data";
var HEADER_PARTIAL_EXCEPT = "x-inertia-partial-except";
var HEADER_LOCATION = "x-inertia-location";
var HEADER_RESET = "x-inertia-reset";
var HEADER_PURPOSE = "purpose";
var HEADER_REDIRECT = "x-inertia-redirect";
var HEADER_ERROR_BAG = "x-inertia-error-bag";
function parseInertiaHeaders(request) {
  const headers = request.headers;
  const inertia2 = headers.get(HEADER_INERTIA) === "true";
  const version = headers.get(HEADER_VERSION);
  const partialComponent = headers.get(HEADER_PARTIAL_COMPONENT);
  const partialDataRaw = headers.get(HEADER_PARTIAL_DATA);
  const partialData = partialDataRaw ? partialDataRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const partialExceptRaw = headers.get(HEADER_PARTIAL_EXCEPT);
  const partialExcept = partialExceptRaw ? partialExceptRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const resetRaw = headers.get(HEADER_RESET);
  const reset = resetRaw ? resetRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const prefetch = headers.get(HEADER_PURPOSE) === "prefetch";
  const errorBag = headers.get(HEADER_ERROR_BAG);
  return { inertia: inertia2, version, partialComponent, partialData, partialExcept, reset, prefetch, errorBag };
}
function isInertiaRequest(request) {
  return request.headers.get(HEADER_INERTIA) === "true";
}
function checkVersionMismatch(request, clientVersion, serverVersion) {
  if (request.method !== "GET") return false;
  if (clientVersion === null || serverVersion === null) return false;
  return clientVersion !== serverVersion;
}
function getPath(obj, path) {
  const segments = path.split(".");
  let current = obj;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") return void 0;
    current = current[segment];
  }
  return current;
}
function hasPath(obj, path) {
  const segments = path.split(".");
  let current = obj;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") return false;
    if (!(segment in current)) return false;
    current = current[segment];
  }
  return true;
}
function setPath(obj, path, value) {
  const segments = path.split(".");
  const result = { ...obj };
  let current = result;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const existing = current[segment];
    const next = existing !== null && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } : {};
    current[segment] = next;
    current = next;
  }
  current[segments[segments.length - 1]] = value;
  return result;
}
function deletePath(obj, path) {
  const segments = path.split(".");
  if (segments.length === 1) {
    const { [segments[0]]: _removed, ...rest } = obj;
    return rest;
  }
  const [head, ...tail] = segments;
  if (!(head in obj) || obj[head] === null || typeof obj[head] !== "object") {
    return obj;
  }
  return {
    ...obj,
    [head]: deletePath(obj[head], tail.join("."))
  };
}
function filterPartialProps(props, partialData, partialExcept) {
  let result = props;
  if (partialData.length > 0) {
    const topLevelKeys = partialData.filter((k) => !k.includes("."));
    const dotPaths = partialData.filter((k) => k.includes("."));
    if (dotPaths.length === 0) {
      const keySet = new Set(topLevelKeys);
      result = Object.fromEntries(
        Object.entries(props).filter(([key]) => keySet.has(key))
      );
    } else {
      let built = {};
      for (const key of topLevelKeys) {
        if (key in props) {
          built[key] = props[key];
        }
      }
      for (const dotPath of dotPaths) {
        if (hasPath(props, dotPath)) {
          built = setPath(built, dotPath, getPath(props, dotPath));
        }
      }
      result = built;
    }
  }
  if (partialExcept.length > 0) {
    const topLevelExcept = partialExcept.filter((k) => !k.includes("."));
    const dotPathExcept = partialExcept.filter((k) => k.includes("."));
    if (dotPathExcept.length === 0) {
      const exceptSet = new Set(topLevelExcept);
      result = Object.fromEntries(
        Object.entries(result).filter(([key]) => !exceptSet.has(key))
      );
    } else {
      const exceptSet = new Set(topLevelExcept);
      let filtered = Object.fromEntries(
        Object.entries(result).filter(([key]) => !exceptSet.has(key))
      );
      for (const dotPath of dotPathExcept) {
        filtered = deletePath(filtered, dotPath);
      }
      result = filtered;
    }
  }
  if ("errors" in props && !("errors" in result)) {
    result = { ...result, errors: props["errors"] };
  }
  return result;
}
function normalizeUrl(request) {
  const url = new URL(request.url);
  return url.pathname + (url.search ?? "");
}
function makeLocationResponse(url) {
  return new Response(null, {
    status: 409,
    headers: {
      [HEADER_LOCATION]: url
    }
  });
}
function makeRedirectResponse(url, options) {
  const isFragment = options?.fragment === true || url.includes("#");
  if (isFragment) {
    return new Response(null, {
      status: 409,
      headers: {
        [HEADER_REDIRECT]: url
      }
    });
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: url
    }
  });
}

// src/page.ts
function createInMemoryOnceStore() {
  const delivered = /* @__PURE__ */ new Map();
  return {
    has: (key) => delivered.has(key),
    set: (key) => {
      delivered.set(key, true);
    },
    delete: (key) => {
      delivered.delete(key);
    }
  };
}
var defaultOnceStore = createInMemoryOnceStore();
async function resolveValue(value, resolveDeferredFn, onceStore, resetKeys) {
  if (!isPropWrapper(value)) {
    return typeof value === "function" ? await value() : value;
  }
  const wrapper = value;
  switch (wrapper._type) {
    case "defer":
      if (resolveDeferredFn) return await wrapper.fn();
      return void 0;
    case "merge":
      return wrapper.value;
    case "deepMerge":
      return wrapper.value;
    case "optional":
      return await wrapper.fn();
    case "always":
      return typeof wrapper.fn === "function" ? await wrapper.fn() : wrapper.fn;
    case "once": {
      const store = onceStore ?? defaultOnceStore;
      const { key, fn } = wrapper;
      if (resetKeys?.has(key)) {
        await store.delete(key);
      }
      if (await store.has(key)) {
        return null;
      }
      const resolved = await fn();
      await store.set(key);
      return resolved;
    }
  }
}
async function assemblePageObject(params) {
  const {
    component,
    routeProps,
    globalSharedProps,
    requestSharedProps,
    errors,
    version,
    request,
    clearHistory,
    encryptHistory,
    preserveFragment,
    preserveScroll,
    onceStore,
    resetKeys: resetKeysArray
  } = params;
  const resetKeys = new Set(resetKeysArray ?? []);
  const sharedKeys = /* @__PURE__ */ new Set([
    ...Object.keys(globalSharedProps),
    ...Object.keys(requestSharedProps)
  ]);
  const mergedProps = {
    ...globalSharedProps,
    ...requestSharedProps,
    errors,
    ...routeProps
  };
  const { partialComponent, partialData, partialExcept } = parseInertiaHeaders(request);
  const isPartialReload = partialComponent !== null && partialComponent === component && (partialData.length > 0 || partialExcept.length > 0);
  const deferredProps = {};
  const mergeProps = [];
  const deepMergeProps = [];
  const sharedProps = [];
  const alwaysKeys = /* @__PURE__ */ new Set();
  for (const [key, value] of Object.entries(mergedProps)) {
    if (sharedKeys.has(key)) {
      sharedProps.push(key);
    }
    if (!isPropWrapper(value)) continue;
    const wrapper = value;
    if (wrapper._type === "defer") {
      const group = wrapper.group ?? "default";
      if (!deferredProps[group]) deferredProps[group] = [];
      deferredProps[group].push(key);
    } else if (wrapper._type === "merge") {
      mergeProps.push(key);
    } else if (wrapper._type === "deepMerge") {
      deepMergeProps.push(key);
    } else if (wrapper._type === "always") {
      alwaysKeys.add(key);
    }
  }
  let includedKeys;
  const allDeferredKeys = new Set(Object.values(deferredProps).flat());
  if (isPartialReload) {
    const filtered = filterPartialProps(mergedProps, partialData, partialExcept);
    const filteredKeySet = new Set(Object.keys(filtered));
    for (const key of alwaysKeys) {
      filteredKeySet.add(key);
    }
    const partialDataSet2 = new Set(partialData);
    for (const key of allDeferredKeys) {
      if (partialDataSet2.has(key)) {
        filteredKeySet.add(key);
      } else {
        filteredKeySet.delete(key);
      }
    }
    includedKeys = [...filteredKeySet];
  } else {
    includedKeys = Object.keys(mergedProps).filter((k) => !allDeferredKeys.has(k));
  }
  const resolvedProps = {};
  const partialDataSet = new Set(partialData);
  await Promise.all(
    includedKeys.map(async (key) => {
      const value = mergedProps[key];
      const resolveDeferred = allDeferredKeys.has(key) && partialDataSet.has(key);
      resolvedProps[key] = await resolveValue(value, resolveDeferred, onceStore, resetKeys);
    })
  );
  const page = {
    component,
    props: resolvedProps,
    url: normalizeUrl(request),
    version
  };
  if (clearHistory !== void 0) page.clearHistory = clearHistory;
  if (encryptHistory !== void 0) page.encryptHistory = encryptHistory;
  if (preserveFragment !== void 0) page.preserveFragment = preserveFragment;
  if (preserveScroll !== void 0) page.preserveScroll = preserveScroll;
  if (Object.keys(deferredProps).length > 0) page.deferredProps = deferredProps;
  if (mergeProps.length > 0) page.mergeProps = mergeProps;
  if (deepMergeProps.length > 0) page.deepMergeProps = deepMergeProps;
  if (sharedProps.length > 0) page.sharedProps = sharedProps;
  return page;
}

// src/ssr.ts
async function runSsr(renderer, page, c) {
  if (!renderer) return null;
  try {
    const result = await renderer({ page, c });
    return result ?? null;
  } catch {
    return null;
  }
}

// src/document.ts
function escapeHtmlAttr(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
}
function renderInertiaRoot(page, options = {}) {
  const { id = "app", ssr = null, scriptSrc } = options;
  const escapedPage = escapeHtmlAttr(JSON.stringify(page));
  const ssrBody = ssr?.body ?? "";
  const div = `<div id="${id}" data-page="${escapedPage}">${ssrBody}</div>`;
  if (scriptSrc) {
    return `${div}
<script type="module" src="${scriptSrc}"></script>`;
  }
  return div;
}
async function buildResponse({
  page,
  c,
  options,
  isInertia,
  status = 200,
  headers
}) {
  const extraHeaders = new Headers(headers);
  if (isInertia) {
    const responseHeaders2 = new Headers(extraHeaders);
    responseHeaders2.set("Content-Type", "application/json");
    responseHeaders2.set("X-Inertia", "true");
    responseHeaders2.set("Vary", "X-Inertia");
    return new Response(JSON.stringify(page), { status, headers: responseHeaders2 });
  }
  const ssr = await runSsr(options.ssr, page, c);
  const result = await options.document({ page, c, ssr });
  if (result instanceof Response) {
    const cloned = new Response(result.body, result);
    cloned.headers.set("Vary", "X-Inertia");
    if (status !== 200 || extraHeaders.keys().next().done === false) {
      const merged = new Response(cloned.body, {
        status,
        headers: cloned.headers
      });
      for (const [key, value] of extraHeaders.entries()) {
        merged.headers.set(key, value);
      }
      return merged;
    }
    return cloned;
  }
  const responseHeaders = new Headers(extraHeaders);
  responseHeaders.set("Content-Type", "text/html; charset=UTF-8");
  responseHeaders.set("Vary", "X-Inertia");
  return new Response(result, { status, headers: responseHeaders });
}

// src/middleware.ts
import Elysia from "elysia";

// src/facade.ts
async function resolveVersion(options, request, c) {
  if (options.version === void 0 || options.version === null) return null;
  if (typeof options.version === "function") return options.version(c) ?? null;
  return options.version;
}
async function resolveErrors(c, options) {
  if (options.resolveErrors) return options.resolveErrors(c);
  return {};
}
async function resolveGlobalShared(c, options) {
  if (options.share) return options.share(c);
  return {};
}
async function resolveRequestShared(state, request) {
  let merged = {};
  for (const entry of state.sharedProps) {
    const resolved = typeof entry === "function" ? await entry(request) : entry;
    merged = { ...merged, ...resolved };
  }
  return merged;
}
function createFacade(state, options, c) {
  const request = c.request;
  return {
    isInertiaRequest() {
      return isInertiaRequest(request);
    },
    isPrefetch() {
      return state.isPrefetch;
    },
    share(props) {
      if (typeof props === "function") {
        const fn = props;
        state.sharedProps.push(() => fn(c));
      } else {
        state.sharedProps.push(props);
      }
    },
    location(url) {
      return makeLocationResponse(url);
    },
    redirect(url) {
      return makeRedirectResponse(url);
    },
    async render(component, props, renderOptions) {
      const [version, errors, globalShared, requestShared] = await Promise.all([
        resolveVersion(options, request, c),
        resolveErrors(c, options),
        resolveGlobalShared(c, options),
        resolveRequestShared(state, request)
      ]);
      const parsed = parseInertiaHeaders(request);
      const page = await assemblePageObject({
        component,
        routeProps: props ?? {},
        globalSharedProps: globalShared,
        requestSharedProps: requestShared,
        errors,
        version,
        request,
        clearHistory: renderOptions?.clearHistory,
        encryptHistory: renderOptions?.encryptHistory,
        preserveFragment: renderOptions?.preserveFragment,
        preserveScroll: renderOptions?.preserveScroll,
        onceStore: options.onceStore ?? defaultOnceStore,
        resetKeys: parsed.reset
      });
      return buildResponse({
        page,
        c,
        options,
        isInertia: isInertiaRequest(request),
        status: renderOptions?.status,
        headers: renderOptions?.headers
      });
    }
  };
}

// src/middleware.ts
function inertia(options) {
  return new Elysia({ name: "elysia-inertia" }).derive({ as: "scoped" }, ({ request }) => {
    const parsed = parseInertiaHeaders(request);
    const state = {
      sharedProps: [],
      isPrefetch: parsed.prefetch
    };
    return { _inertiaState: state, _inertiaHeaders: parsed };
  }).onBeforeHandle({ as: "scoped" }, async ({ request, _inertiaHeaders }) => {
    if (_inertiaHeaders.inertia && request.method === "GET") {
      const serverVersion = options.version === void 0 || options.version === null ? null : typeof options.version === "function" ? await options.version({ request }) : options.version;
      if (checkVersionMismatch(request, _inertiaHeaders.version, serverVersion ?? null)) {
        return makeLocationResponse(normalizeUrl(request));
      }
    }
  }).resolve({ as: "scoped" }, (ctx) => {
    const facade = createFacade(
      ctx._inertiaState,
      options,
      ctx
    );
    return { inertia: facade };
  });
}

// src/precognition.ts
import Elysia2 from "elysia";
function precognition(options) {
  return new Elysia2({ name: "elysia-precognition" }).onBeforeHandle(
    { as: "scoped" },
    async (c) => {
      const isPrecognition = c.request.headers.get("Precognition") === "true";
      if (!isPrecognition) {
        return;
      }
      const validateOnlyHeader = c.request.headers.get(
        "Precognition-Validate-Only"
      );
      const fields = validateOnlyHeader ? validateOnlyHeader.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const errors = await options.validate(c, fields);
      if (errors && Object.keys(errors).length > 0) {
        return new Response(JSON.stringify({ errors }), {
          status: 422,
          headers: {
            "Content-Type": "application/json",
            Precognition: "true"
          }
        });
      }
      return new Response(null, {
        status: 204,
        headers: {
          Precognition: "true",
          "Precognition-Success": "true"
        }
      });
    }
  );
}
export {
  always,
  createInMemoryOnceStore,
  deepMerge,
  defer,
  inertia,
  isPropWrapper,
  lazy,
  merge,
  once,
  optional,
  precognition,
  renderInertiaRoot
};
