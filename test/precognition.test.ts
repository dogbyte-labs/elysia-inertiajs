import { describe, it, expect, vi } from 'vitest'
import Elysia from 'elysia'
import { precognition } from '../src/index.js'

describe('precognition middleware', () => {
  it('passes through non-precognition requests to next middleware', async () => {
    const validate = vi.fn().mockResolvedValue(null)
    const app = new Elysia().use(precognition({ validate }))
    app.get('/submit', () => new Response('handled', { status: 200 }))

    const res = await app.handle(new Request('http://localhost/submit'))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('handled')
    expect(validate).not.toHaveBeenCalled()
  })

  it('returns 422 with Precognition header and errors on validation failure', async () => {
    const errors = { email: 'Invalid email', name: 'Required' }
    const validate = vi.fn().mockResolvedValue(errors)
    const app = new Elysia().use(precognition({ validate }))
    app.post('/submit', () => new Response('handled', { status: 200 }))

    const res = await app.handle(new Request('http://localhost/submit', { method: 'POST', headers: { Precognition: 'true' } }))
    expect(res.status).toBe(422)
    expect(res.headers.get('Precognition')).toBe('true')
    expect(res.headers.get('Precognition-Success')).toBeNull()
    expect(await res.json()).toEqual({ errors })
  })

  it('returns 204 with Precognition and Precognition-Success headers on success', async () => {
    const validate = vi.fn().mockResolvedValue(null)
    const app = new Elysia().use(precognition({ validate }))
    app.post('/submit', () => new Response('handled', { status: 200 }))

    const res = await app.handle(new Request('http://localhost/submit', { method: 'POST', headers: { Precognition: 'true' } }))
    expect(res.status).toBe(204)
    expect(res.headers.get('Precognition')).toBe('true')
    expect(res.headers.get('Precognition-Success')).toBe('true')
  })

  it('passes parsed field list from Precognition-Validate-Only header to validator', async () => {
    const validate = vi.fn().mockResolvedValue(null)
    const app = new Elysia().use(precognition({ validate }))
    app.post('/submit', () => new Response('handled', { status: 200 }))

    await app.handle(new Request('http://localhost/submit', { method: 'POST', headers: { Precognition: 'true', 'Precognition-Validate-Only': 'email, name , phone' } }))
    expect(validate).toHaveBeenCalledOnce()
    const [, fields] = validate.mock.calls[0]
    expect(fields).toEqual(['email', 'name', 'phone'])
  })

  it('validate-only with errors returns 422 with only requested fields in errors', async () => {
    const allErrors = { email: 'Invalid', name: 'Required', phone: 'Too short' }
    const validate = vi.fn((_c, fields: string[]) => {
      if (fields.length === 0) return allErrors
      return Object.fromEntries(Object.entries(allErrors).filter(([k]) => fields.includes(k)))
    })
    const app = new Elysia().use(precognition({ validate }))
    app.post('/submit', () => new Response('handled', { status: 200 }))

    const res = await app.handle(new Request('http://localhost/submit', { method: 'POST', headers: { Precognition: 'true', 'Precognition-Validate-Only': 'email' } }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.errors).toEqual({ email: 'Invalid' })
    expect(body.errors.name).toBeUndefined()
  })

  it('passes empty fields array when Precognition-Validate-Only header is absent', async () => {
    const validate = vi.fn().mockResolvedValue(null)
    const app = new Elysia().use(precognition({ validate }))
    app.post('/submit', () => new Response('handled', { status: 200 }))

    await app.handle(new Request('http://localhost/submit', { method: 'POST', headers: { Precognition: 'true' } }))
    const [, fields] = validate.mock.calls[0]
    expect(fields).toEqual([])
  })
})
