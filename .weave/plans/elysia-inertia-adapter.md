# Elysia InertiaJS Adapter

## TL;DR
> **Summary**: Recreate the `hono-inertia` package in `elysia-inertiajs` by porting the framework-agnostic Inertia protocol modules mostly unchanged, then replacing the Hono-specific middleware/context layer with an Elysia plugin + request-scoped facade and an `app.handle(Request)`-driven test suite.
> **Estimated Effort**: Medium

## Context
### Original Request
Create a concise, execution-ready plan for building an InertiaJS adapter for ElysiaJS in `/home/ubuntu/projects/elysia-inertiajs`, using `/home/ubuntu/projects/hono-inertia` as the reference implementation.

### Key Findings
- The target repo is effectively empty: it currently contains agent assets and `.weave/runtime`, but no package scaffold, source files, tests, or docs. Bootstrapping the library package is part of the work.
- The reference repo cleanly separates framework-agnostic modules (`src/protocol.ts`, `src/props.ts`, `src/page.ts`, `src/document.ts`, `src/ssr.ts`) from the Hono-specific layer (`src/context.ts`, `src/facade.ts`, `src/middleware.ts`). That split should be preserved.
- `src/types.ts` in the reference is the main shared contract surface; the Elysia port mainly needs its callback `Context` imports swapped from Hono to Elysia while keeping page/prop types intact.
- Elysia should expose the adapter through `.use(inertia(options))`, not Hono-style `app.use('*', ...)`. Request-local `share()` state must be created per request via `derive`/`resolve`, not `decorate`, or props will leak across requests.
- Version-mismatch handling should stay early in the lifecycle and likely move into an Elysia `onBeforeHandle` hook so GET Inertia requests can return `409` + `X-Inertia-Location` before route handlers run.
- The existing Vitest suite is a strong migration guide: most unit tests should port with minimal changes, while integration tests need Elysia route syntax and `app.handle(new Request(...))` instead of `app.request(...)`.
- Main risk/unknown: `precognition` cannot be ported as a Hono-style per-route middleware verbatim. It likely needs an Elysia plugin/scoped hook API, and that divergence must be documented explicitly.

## Objectives
### Core Objective
Ship an ESM TypeScript library that gives Elysia apps the same practical Inertia behavior as the Hono adapter: HTML/JSON rendering, shared props, version handling, partial reloads, deferred/merge/once props, redirects, optional SSR, and Precognition support.

### Deliverables
- [ ] Package scaffold for a publishable Elysia adapter library
- [ ] Ported framework-agnostic Inertia core modules
- [ ] Elysia-specific plugin, request facade, and public exports
- [ ] Ported Vitest suite using `app.handle(new Request(...))`
- [ ] README and example app showing the Elysia API

### Definition of Done
- [ ] `pnpm test` passes in `/home/ubuntu/projects/elysia-inertiajs`
- [ ] `pnpm build` emits `dist/` without TypeScript errors
- [ ] A sample Elysia app can call `new Elysia().use(inertia(options))` and access `inertia` from route context
- [ ] README usage matches the exported API and test-covered behavior

### Guardrails (Must NOT)
- [ ] Do not rewrite the protocol/page/document logic unless Elysia integration forces it
- [ ] Do not store per-request shared props in plugin-global state or `decorate()`
- [ ] Do not introduce Bun-only runtime assumptions unless the package intentionally switches away from the Vitest workflow used by the reference
- [ ] Do not silently preserve Hono-only ergonomics where Elysia needs a different API shape; document intentional differences

## TODOs

- [x] 1. Bootstrap the package and build/test scaffold
  **What**: Create the library skeleton so the port has a real package target: package metadata, TypeScript configs, source/test/example directories, and scripts aligned with the reference package but targeting Elysia.
  **Files**: `/home/ubuntu/projects/elysia-inertiajs/package.json`, `/home/ubuntu/projects/elysia-inertiajs/tsconfig.json`, `/home/ubuntu/projects/elysia-inertiajs/tsconfig.build.json`, `/home/ubuntu/projects/elysia-inertiajs/README.md`
  **Acceptance**: The repo has a publishable ESM package shape with `build` and `test` scripts, `elysia` is declared as the framework dependency/peer dependency, and TypeScript path/export settings point at `src/index.ts`.

- [x] 2. Port the framework-agnostic Inertia core first
  **What**: Copy the stable logic from the Hono adapter before touching framework glue. Keep behavior identical for header parsing, partial prop filtering, prop wrappers, once-store behavior, page assembly, SSR wrapper execution, and document response building; only adjust imports/types where Elysia context types are part of the public contract.
  **Files**: `/home/ubuntu/projects/elysia-inertiajs/src/types.ts`, `/home/ubuntu/projects/elysia-inertiajs/src/protocol.ts`, `/home/ubuntu/projects/elysia-inertiajs/src/props.ts`, `/home/ubuntu/projects/elysia-inertiajs/src/page.ts`, `/home/ubuntu/projects/elysia-inertiajs/src/document.ts`, `/home/ubuntu/projects/elysia-inertiajs/src/ssr.ts`
  **Acceptance**: The core modules compile in isolation and match the reference API/behavior closely enough that the protocol/props/page/document tests can be ported with mostly mechanical edits.

- [x] 3. Implement the Elysia-specific adapter surface
  **What**: Build the request-scoped adapter layer: an internal request-state shape, the `InertiaFacade`, and the exported `inertia(options)` plugin. Use Elysia lifecycle hooks for version mismatch short-circuiting and a scoped `derive`/`resolve` strategy so route handlers can access `inertia` from Elysia context without type leakage or shared mutable state.
  **Files**: `/home/ubuntu/projects/elysia-inertiajs/src/context.ts`, `/home/ubuntu/projects/elysia-inertiajs/src/facade.ts`, `/home/ubuntu/projects/elysia-inertiajs/src/middleware.ts`, `/home/ubuntu/projects/elysia-inertiajs/src/index.ts`
  **Acceptance**: An app structured as `new Elysia().use(inertia({ ... }))` can call `inertia.render()`, `inertia.share()`, `inertia.location()`, `inertia.redirect()`, `inertia.isInertiaRequest()`, and `inertia.isPrefetch()` from route context, and GET version mismatches return the correct `409` response before handler execution.

- [x] 4. Port Precognition in an Elysia-native shape
  **What**: Recreate the existing Precognition behavior using Elysia hooks/plugins instead of Hono middleware chaining. Preserve request detection, field parsing, 204 success responses, and 422 validation payloads; decide on the cleanest Elysia mounting pattern and document it as an intentional API difference if exact Hono syntax is not possible.
  **Files**: `/home/ubuntu/projects/elysia-inertiajs/src/precognition.ts`, `/home/ubuntu/projects/elysia-inertiajs/src/index.ts`, `/home/ubuntu/projects/elysia-inertiajs/README.md`
  **Acceptance**: Precognition requests short-circuit correctly, non-Precognition requests continue to the real route handler, and the public API for mounting Precognition is documented and testable in Elysia.

- [x] 5. Rebuild the test suite around Elysia request handling
  **What**: Port the reference tests with minimal semantic drift. Keep unit tests near-identical for framework-agnostic modules, then rewrite the integration/facade/Precognition tests to build Elysia apps, register plugins with `.use(...)`, and execute requests with `app.handle(new Request(...))`.
  **Files**: `/home/ubuntu/projects/elysia-inertiajs/test/protocol.test.ts`, `/home/ubuntu/projects/elysia-inertiajs/test/props.test.ts`, `/home/ubuntu/projects/elysia-inertiajs/test/page.test.ts`, `/home/ubuntu/projects/elysia-inertiajs/test/document.test.ts`, `/home/ubuntu/projects/elysia-inertiajs/test/facade.test.ts`, `/home/ubuntu/projects/elysia-inertiajs/test/integration.test.ts`, `/home/ubuntu/projects/elysia-inertiajs/test/precognition.test.ts`
  **Acceptance**: The suite covers HTML vs JSON responses, partial reloads, deferred props, redirects, shared props, error resolution, prefetch detection, version mismatches, and Precognition flows using Elysia apps and `Request` objects only.

- [x] 6. Finish the public API, example, and docs pass
  **What**: Add the README and example last, once the public surface is stable. Mirror the structure of `hono-inertia` docs, but update route examples to Elysia syntax, explain `use(inertia(...))`, note any Precognition API differences, and keep the example app aligned with the tested export surface.
  **Files**: `/home/ubuntu/projects/elysia-inertiajs/README.md`, `/home/ubuntu/projects/elysia-inertiajs/examples/basic.ts`, `/home/ubuntu/projects/elysia-inertiajs/src/index.ts`
  **Acceptance**: A reader can follow the README/example to build a minimal Elysia + Inertia server without consulting the source, and every documented symbol is exported from `src/index.ts` and exercised somewhere in tests.

## Verification
- [ ] All tests pass
- [ ] No regressions against the Hono reference for protocol/page/document behavior
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] Smoke-test a minimal app using `new Elysia().use(inertia({ document }))` and `app.handle(new Request('http://localhost/...'))`
