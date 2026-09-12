import { describe, it, expect } from 'vitest'
import { returnOutcome, returnTarget } from './return-action'
import type { ComposedSlot, EnvelopeDetail, EnvelopeOrigin } from '@/stores/envelopes'

function slot(id: string, over: Partial<ComposedSlot> = {}): ComposedSlot {
  return { id, orderIndex: 1, ...over }
}

function detail(slots: ComposedSlot[], origin?: EnvelopeOrigin, status = 'sent'): EnvelopeDetail {
  return {
    envelope: { id: 'env-1', status, orderPolicy: 'sequential', version: 1, origin },
    slots,
    documents: [{ documentId: 'doc-1' }],
  }
}

// The requester, as the portal names it. An older envelope may still carry a stored
// default address on its origin; it is never consulted.
const ACME: EnvelopeOrigin = {
  name: 'Acme DMS',
  returnUrl: 'https://dms.acme.example/return?state=q8Zr',
  ref: 'contracts/2026-117',
}

describe('returnTarget', () => {
  it('is null without an origin — an envelope started in the portal has no way back', () => {
    const own = slot('s-1', { returnUrl: 'https://dms.acme.example/contracts/2026-117' })
    expect(returnTarget(detail([own]), own, 'signed')).toBeNull()
    expect(returnTarget(null, own, 'signed')).toBeNull()
  })

  it("is null for a signer the requester gave no address — even when the envelope's origin stores a default (no address, no button)", () => {
    const external = slot('s-2', { orderIndex: 2 })
    expect(returnTarget(detail([external], ACME), external, 'signed')).toBeNull()
  })

  it('is null when the viewer has no slot — a return belongs to a signer', () => {
    expect(returnTarget(detail([], ACME), null, 'cancelled')).toBeNull()
  })

  it("uses this signer's own return address and appends signingRequest + slot + outcome, keeping the stored query", () => {
    const own = slot('s-1', { orderIndex: 2, returnUrl: 'https://dms.acme.example/contracts/2026-117?state=q8Zr' })
    const t = returnTarget(detail([own], ACME), own, 'signed')
    expect(t?.name).toBe('Acme DMS')
    expect(t?.href).toBe('https://dms.acme.example/contracts/2026-117?state=q8Zr&signingRequest=env-1&slot=2&outcome=signed')
  })

  it("names the requester from the origin and the act from the signer", () => {
    const own = slot('s-1', { orderIndex: 1, returnUrl: 'https://dms.acme.example/contracts/2026-117?state=q8Zr' })
    const t = returnTarget(detail([own], { name: 'Acme DMS' }), own, 'declined')
    expect(t?.name).toBe('Acme DMS')
    expect(t?.href).toBe('https://dms.acme.example/contracts/2026-117?state=q8Zr&signingRequest=env-1&slot=1&outcome=declined')
  })

  it('names the envelope it shows even when the stored address claims another request', () => {
    const stale = slot('s-1', { returnUrl: 'https://dms.acme.example/return?state=q8Zr&signingRequest=other' })
    const t = returnTarget(detail([stale], ACME), stale, 'signed')
    expect(t?.href).toBe('https://dms.acme.example/return?state=q8Zr&signingRequest=env-1&slot=1&outcome=signed')
  })

  it('refuses a return address that is not https, and one that is not a URL', () => {
    const http = slot('s-1', { returnUrl: 'http://dms.acme.example/return' })
    const junk = slot('s-1', { returnUrl: 'not a url' })
    const script = slot('s-1', { returnUrl: 'javascript:alert(1)' })
    expect(returnTarget(detail([http], { name: 'X' }), http, 'signed')).toBeNull()
    expect(returnTarget(detail([junk], { name: 'X' }), junk, 'signed')).toBeNull()
    expect(returnTarget(detail([script], { name: 'X' }), script, 'signed')).toBeNull()
  })
})

describe('returnOutcome', () => {
  it("is the signer's act: signed, declined — and cancelled only while their part was open", () => {
    expect(returnOutcome(detail([]), slot('s-1', { signatureId: 'sig' }))).toBe('signed')
    expect(returnOutcome(detail([]), slot('s-1', { status: 'declined' }))).toBe('declined')
    expect(returnOutcome(detail([], undefined, 'cancelled'), slot('s-1'))).toBe('cancelled')
    expect(returnOutcome(detail([], undefined, 'cancelled'), null)).toBe('cancelled')
  })

  it('lets the act win over a later cancel', () => {
    expect(returnOutcome(detail([], undefined, 'cancelled'), slot('s-1', { signatureId: 'sig' }))).toBe('signed')
  })

  it('is null while the person can still act, and without an envelope', () => {
    expect(returnOutcome(detail([]), slot('s-1'))).toBeNull()
    expect(returnOutcome(detail([]), null)).toBeNull()
    expect(returnOutcome(null, slot('s-1', { signatureId: 'sig' }))).toBeNull()
  })
})
