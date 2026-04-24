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

import Elysia, { type Context } from 'elysia'
import type { MaybePromise } from './types.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PrecognitionOptions {
  /**
   * Called only for requests carrying the `Precognition: true` header.
   *
   * Return a non-empty errors object to produce a 422 response; return
   * `null`, `undefined`, or an empty object to signal success (204).
   */
  validate: (
    c: Context,
    fields: string[],
  ) => MaybePromise<Record<string, string | string[]> | null | undefined>
}

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

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
export function precognition(options: PrecognitionOptions) {
  return new Elysia({ name: 'elysia-precognition' }).onBeforeHandle(
    { as: 'scoped' },
    async (c) => {
      const isPrecognition =
        c.request.headers.get('Precognition') === 'true'

      if (!isPrecognition) {
        // Not a precognition request — let the real handler run.
        return
      }

      const validateOnlyHeader = c.request.headers.get(
        'Precognition-Validate-Only',
      )
      const fields: string[] = validateOnlyHeader
        ? validateOnlyHeader
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []

      const errors = await options.validate(c as unknown as Context, fields)

      if (errors && Object.keys(errors).length > 0) {
        return new Response(JSON.stringify({ errors }), {
          status: 422,
          headers: {
            'Content-Type': 'application/json',
            Precognition: 'true',
          },
        })
      }

      return new Response(null, {
        status: 204,
        headers: {
          Precognition: 'true',
          'Precognition-Success': 'true',
        },
      })
    },
  )
}
