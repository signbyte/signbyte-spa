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

const ACME: EnvelopeOrigin = {
  name: 'Acme DMS',
  returnUrl: 'https://dms.acme.example/return?state=q8Zr&signingRequest=01K5V8',
  ref: 'contracts/2026-117',
}

describe('returnTarget', () => {
  it('is null without an origin — an envelope started in the portal has no way back', () => {
    expect(returnTarget(detail([slot('s-1')]), slot('s-1'), 'signed')).toBeNull()
    expect(returnTarget(null, slot('s-1'), 'signed')).toBeNull()
  })

  it('is null when the origin names the requester but stores no return address', () => {
    expect(returnTarget(detail([], { name: 'Acme DMS' }), slot('s-1'), 'signed')).toBeNull()
  })

  it("uses the origin's default address and appends slot + outcome, keeping the stored query", () => {
    const t = returnTarget(detail([], ACME), slot('s-1', { orderIndex: 2 }), 'signed')
    expect(t?.name).toBe('Acme DMS')
    expect(t?.href).toBe('https://dms.acme.example/return?state=q8Zr&signingRequest=01K5V8&slot=2&outcome=signed')
  })

  it("prefers this signer's own return address over the default", () => {
    const own = slot('s-1', { orderIndex: 1, returnUrl: 'https://dms.acme.example/contracts/2026-117?state=q8Zr' })
    const t = returnTarget(detail([own], ACME), own, 'declined')
    expect(t?.href).toBe('https://dms.acme.example/contracts/2026-117?state=q8Zr&slot=1&outcome=declined')
  })

  it('omits slot when the viewer has none, still naming the outcome', () => {
    const t = returnTarget(detail([], ACME), null, 'cancelled')
    expect(t?.href).toBe('https://dms.acme.example/return?state=q8Zr&signingRequest=01K5V8&outcome=cancelled')
  })

  it('refuses a return address that is not https, and one that is not a URL', () => {
    expect(returnTarget(detail([], { name: 'X', returnUrl: 'http://dms.acme.example/return' }), null, 'signed')).toBeNull()
    expect(returnTarget(detail([], { name: 'X', returnUrl: 'not a url' }), null, 'signed')).toBeNull()
    expect(returnTarget(detail([], { name: 'X', returnUrl: 'javascript:alert(1)' }), null, 'signed')).toBeNull()
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
