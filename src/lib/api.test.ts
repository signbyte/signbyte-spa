import { describe, it, expect, vi, afterEach } from 'vitest'
import { api, csrfFrom, toApiError, ApiError } from './api'

describe('toApiError', () => {
  it('reads the stable code from the problem+json envelope (the `code` field)', () => {
    // The portal API returns RFC 9457 problem+json — the code the UI's guidance map
    // keys on lives in `code` (an err:domain:reason string).
    const err = toApiError(409, {
      code: 'err:document:chainAdvanced',
      title: 'Document changed since signing began',
      status: 409,
    })

    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(409)
    expect(err.code).toBe('err:document:chainAdvanced')
  })

  it('falls back to a legacy `error` field when no `code` is present', () => {
    const err = toApiError(403, { error: 'binding_mismatch' })

    expect(err.code).toBe('binding_mismatch')
  })

  it('yields a null code for a body that carries neither', () => {
    expect(toApiError(500, {}).code).toBeNull()
    expect(toApiError(500, null).code).toBeNull()
  })

  it('captures the RFC 9457 trace_id as a safe support reference', () => {
    const err = toApiError(422, {
      code: 'err:signing:invalidDocument',
      status: 422,
      trace_id: '3f87dea347630318e102bb7546c7c412',
    })

    expect(err.code).toBe('err:signing:invalidDocument')
    expect(err.traceId).toBe('3f87dea347630318e102bb7546c7c412')
  })

  it('leaves traceId null when the body carries none', () => {
    expect(toApiError(500, { code: 'err:internal:unknown' }).traceId).toBeNull()
  })
})

describe('error body parsing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Regression: the API's typed errors arrive as `application/problem+json`.
  // A parse that only recognizes the exact `application/json` media type turns
  // the body into an opaque blob, loses the `code`, and degrades every typed
  // message in the UI to the generic one (found live on the verify screen).
  it('parses an application/problem+json error body so the code survives', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'err:verify:malformed', status: 422 }), {
          status: 422,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
      ),
    )

    await expect(api.get('/verify-probe')).rejects.toMatchObject({
      status: 422,
      code: 'err:verify:malformed',
    })
  })
})

describe('the anti-forgery token a change echoes', () => {
  it.each([
    ['over https, the __Host- cookie beside a planted plain one listed first', 'portal_csrf=planted; __Host-portal_csrf=own', true, 'own'],
    ['over https, only a planted plain one', 'portal_csrf=planted', true, null],
    ['over https, only a planted __Secure- one', '__Secure-portal_csrf=planted', true, null],
    ['over https, a miscapitalised __Host- one', '__host-portal_csrf=planted', true, null],
    ['over plain http, the plain one a development API sets', 'portal_csrf=tok', false, 'tok'],
    ['over plain http, the __Host- one before the plain', 'portal_csrf=planted; __Host-portal_csrf=own', false, 'own'],
  ])('%s', (_case, cookies, secure, want) => {
    expect(csrfFrom(cookies, secure)).toBe(want)
  })
})
