import { describe, it, expect } from 'vitest'
import {
  isSigned,
  isDeclined,
  isFinished,
  turnSlotIds,
  signedCount,
  ownerSlot,
  slotDisplay,
  toneFor,
  allSigned,
  othersSigningNow,
  ownedEnvelopeBadge,
} from './envelope-status'
import type { ComposedSlot, EnvelopeDetail, EnvelopeSummary } from '@/stores/envelopes'

function slot(id: string, over: Partial<ComposedSlot> = {}): ComposedSlot {
  return { id, orderIndex: 0, ...over }
}

function detail(slots: ComposedSlot[], orderPolicy = 'sequential'): EnvelopeDetail {
  return {
    envelope: { id: 'env-1', status: 'sent', orderPolicy, version: 1 },
    slots,
    documents: [{ documentId: 'doc-1' }],
  }
}

describe('envelope-status readers', () => {
  it('treats a recorded signature, a COMPLETED job, or a signed slot status as signed', () => {
    expect(isSigned(slot('a', { signatureId: 'sig-1' }))).toBe(true)
    expect(isSigned(slot('a', { state: 'COMPLETED' }))).toBe(true)
    expect(isSigned(slot('a', { status: 'signed' }))).toBe(true)
    expect(isSigned(slot('a'))).toBe(false)
  })

  it('reads a declined slot from the status or the job state', () => {
    expect(isDeclined(slot('a', { status: 'declined' }))).toBe(true)
    expect(isDeclined(slot('a', { state: 'DECLINED' }))).toBe(true)
    expect(isDeclined(slot('a'))).toBe(false)
  })

  it('counts a slot finished once signed or declined', () => {
    expect(isFinished(slot('a', { signatureId: 's' }))).toBe(true)
    expect(isFinished(slot('a', { status: 'declined' }))).toBe(true)
    expect(isFinished(slot('a'))).toBe(false)
  })

  it('sequential: only the first unfinished slot is whose-turn', () => {
    const d = detail([
      slot('s1', { orderIndex: 0, signatureId: 'sig' }),
      slot('s2', { orderIndex: 1 }),
      slot('s3', { orderIndex: 2 }),
    ])
    const turn = turnSlotIds(d)
    expect([...turn]).toEqual(['s2'])
  })

  it('parallel: every unfinished slot is whose-turn', () => {
    const d = detail(
      [slot('s1', { orderIndex: 0 }), slot('s2', { orderIndex: 1, signatureId: 'sig' }), slot('s3', { orderIndex: 2 })],
      'parallel',
    )
    const turn = turnSlotIds(d)
    expect([...turn].sort()).toEqual(['s1', 's3'])
  })

  it('reports no turn once every slot is finished', () => {
    const d = detail([slot('s1', { signatureId: 'a' }), slot('s2', { status: 'declined' })])
    expect(turnSlotIds(d).size).toBe(0)
  })

  it('counts signed slots and reports fully-signed', () => {
    const d = detail([slot('s1', { signatureId: 'a' }), slot('s2', { state: 'COMPLETED' })])
    expect(signedCount(d)).toBe(2)
    expect(allSigned(d)).toBe(true)

    const partial = detail([slot('s1', { signatureId: 'a' }), slot('s2')])
    expect(signedCount(partial)).toBe(1)
    expect(allSigned(partial)).toBe(false)
  })

  it('treats the first slot in order as the owner (the wizard seeds the owner first)', () => {
    const d = detail([slot('a', { orderIndex: 1 }), slot('b', { orderIndex: 0 })])
    expect(ownerSlot(d)?.id).toBe('b') // lowest orderIndex after sort
  })

  it('maps a slot to a display state and a paired tone', () => {
    expect(slotDisplay(slot('a', { status: 'declined' }), false)).toBe('declined')
    expect(slotDisplay(slot('a', { signatureId: 's' }), false)).toBe('signed')
    expect(slotDisplay(slot('a', { state: 'AWAITING_CLIENT_SIGNATURE' }), false)).toBe('inProgress')
    expect(slotDisplay(slot('a'), true)).toBe('turn')
    // Viewer-aware: a turn slot reads as the viewer's own turn vs another's.
    expect(slotDisplay(slot('a'), true, true)).toBe('yourTurn')
    expect(slotDisplay(slot('a'), true, false)).toBe('turn')
    expect(slotDisplay(slot('a'), false)).toBe('waiting')

    expect(toneFor('signed')).toBe('green')
    expect(toneFor('yourTurn')).toBe('green')
    expect(toneFor('declined')).toBe('red')
    expect(toneFor('turn')).toBe('amber')
    expect(toneFor('inProgress')).toBe('amber')
    expect(toneFor('waiting')).toBe('neutral')
  })

  it('othersSigningNow: only flags a parallel envelope with another slot mid-signing', () => {
    // Parallel, another slot has a live job → advisory applies (excluding my own slot).
    const parallel = detail(
      [slot('mine', { orderIndex: 0 }), slot('other', { orderIndex: 1, state: 'AWAITING_CLIENT_SIGNATURE' })],
      'parallel',
    )
    expect(othersSigningNow(parallel, 'mine')).toBe(true)
    // My own in-flight job never counts as "another signer".
    expect(othersSigningNow(parallel, 'other')).toBe(false)

    // Sequential never warns — turns are serialised.
    const sequential = detail(
      [slot('mine', { orderIndex: 0 }), slot('other', { orderIndex: 1, state: 'AWAITING_CLIENT_SIGNATURE' })],
      'sequential',
    )
    expect(othersSigningNow(sequential, 'mine')).toBe(false)

    // No other slot active (signed/idle) → no advisory.
    const idle = detail(
      [slot('mine', { orderIndex: 0 }), slot('other', { orderIndex: 1, signatureId: 'sig' })],
      'parallel',
    )
    expect(othersSigningNow(idle, 'mine')).toBe(false)
    expect(othersSigningNow(null, 'mine')).toBe(false)
  })
})

describe('ownedEnvelopeBadge', () => {
  function summary(over: Partial<EnvelopeSummary> = {}): EnvelopeSummary {
    return { id: 'env-1', status: 'in_progress', version: 1, slotCount: 2, signedCount: 0, ...over }
  }

  it('terminal states win over the progress signals', () => {
    expect(ownedEnvelopeBadge(summary({ status: 'completed', yourTurn: true })).labelKey).toBe('envelopes.badge.completed')
    expect(ownedEnvelopeBadge(summary({ status: 'cancelled' })).tone).toBe('red')
    expect(ownedEnvelopeBadge(summary({ status: 'declined' })).labelKey).toBe('envelopes.badge.declined')
    expect(ownedEnvelopeBadge(summary({ status: 'draft', yourTurn: true })).labelKey).toBe('envelopes.badge.draft')
  })

  it('shows the owner their own turn when actionable', () => {
    const b = ownedEnvelopeBadge(summary({ status: 'sent', yourTurn: true, signedCount: 0 }))
    expect(b.labelKey).toBe('envelopes.badge.yourTurn')
    expect(b.tone).toBe('green')
  })

  it('shows progress when waiting on other signers, and plain waiting when nothing is signed', () => {
    const progress = ownedEnvelopeBadge(summary({ status: 'in_progress', yourTurn: false, signedCount: 1, slotCount: 2 }))
    expect(progress.labelKey).toBe('envelopes.badge.progress')
    expect(progress.params).toEqual({ signed: 1, total: 2 })

    const waiting = ownedEnvelopeBadge(summary({ status: 'sent', yourTurn: false, signedCount: 0, slotCount: 2 }))
    expect(waiting.labelKey).toBe('envelopes.badge.waiting')
  })
})
