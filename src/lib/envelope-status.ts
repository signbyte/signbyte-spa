// Derives display status from the composed envelope view the BFF returns. The SPA
// renders the backend's state; it never invents lifecycle — these are pure readers
// over the slots so the tracking page, the home inbox, and their tests agree.
import type { ComposedSlot, EnvelopeDetail, EnvelopeSummary } from '@/stores/envelopes'

// The display state of one signer slot, mapped to a pill tone by the view.
// `turn` is another participant's turn; `yourTurn` is the viewer's own turn (so the
// pill reads "Your turn" in green on your own slot, not the generic "Their turn").
export type SlotDisplay = 'signed' | 'inProgress' | 'declined' | 'turn' | 'yourTurn' | 'waiting'

// A slot is signed once it has a recorded signature or its job/slot state says so.
export function isSigned(slot: ComposedSlot): boolean {
  return Boolean(slot.signatureId) || slot.state === 'COMPLETED' || slot.status === 'signed'
}

// A slot is declined when the envelope service or its job records a refusal.
export function isDeclined(slot: ComposedSlot): boolean {
  return slot.status === 'declined' || /declined|cancelled/i.test(slot.state ?? '')
}

// A slot is finished (no longer awaiting action) when it is signed or declined.
export function isFinished(slot: ComposedSlot): boolean {
  return isSigned(slot) || isDeclined(slot)
}

// Slots in signing order. A copy, so callers can't mutate the store's array.
export function sortedSlots(detail: EnvelopeDetail | null): ComposedSlot[] {
  return [...(detail?.slots ?? [])].sort((a, b) => a.orderIndex - b.orderIndex)
}

// The ids of the slots whose turn it is to sign now. Sequential: only the first
// unfinished slot. Parallel: every unfinished slot. Empty once all are finished.
export function turnSlotIds(detail: EnvelopeDetail | null): Set<string> {
  const unfinished = sortedSlots(detail).filter((s) => !isFinished(s))
  if (unfinished.length === 0) return new Set()
  if (detail?.envelope.orderPolicy === 'parallel') {
    return new Set(unfinished.map((s) => s.id))
  }

  return new Set([unfinished[0].id])
}

// How many slots have signed, for the "k of N signed" progress label.
export function signedCount(detail: EnvelopeDetail | null): number {
  return sortedSlots(detail).filter(isSigned).length
}

// The owner's own signer slot. The new-signing wizard seeds the owner as the first
// slot (orderIndex 0), and the owner is the only viewer of their envelope (the list
// is owner-filtered), so the first slot in order is "your slot" on the tracking page.
export function ownerSlot(detail: EnvelopeDetail | null): ComposedSlot | undefined {
  return sortedSlots(detail)[0]
}

// The display state of a slot, given whether it is this slot's turn now and whether
// it is the viewer's own slot. A turn slot reads as the viewer's own turn (`yourTurn`)
// or another participant's turn (`turn`) — so the pill is viewer-aware.
export function slotDisplay(slot: ComposedSlot, isTurn: boolean, isYou = false): SlotDisplay {
  if (isDeclined(slot)) return 'declined'
  if (isSigned(slot)) return 'signed'
  if (slot.state && !/failed/i.test(slot.state)) return 'inProgress'
  if (isTurn) return isYou ? 'yourTurn' : 'turn'

  return 'waiting'
}

// The pill tone for a slot display state — colour is paired with a label by the view.
export function toneFor(display: SlotDisplay): 'green' | 'amber' | 'red' | 'neutral' {
  switch (display) {
    case 'signed':
    case 'yourTurn':
      return 'green'
    case 'declined':
      return 'red'
    case 'inProgress':
    case 'turn':
      return 'amber'
    default:
      return 'neutral'
  }
}

// True when another participant is actively signing right now — some slot other than
// the given one has a live (non-failed) signing job in flight. This is the basis for
// the advisory shown before a participant signs: with parallel order two co-signs can
// land at once, and the keep-latest guard makes the second re-merge (or, if it keeps
// losing the race, asks that signer to review the now-latest and sign again). Only
// meaningful for parallel order — sequential serialises turns, so it never applies.
export function othersSigningNow(detail: EnvelopeDetail | null, exceptSlotId: string): boolean {
  if (detail?.envelope.orderPolicy !== 'parallel') return false

  return sortedSlots(detail).some((s) => s.id !== exceptSlotId && slotDisplay(s, false) === 'inProgress')
}

// True once every slot is signed (the envelope is fully signed).
export function allSigned(detail: EnvelopeDetail | null): boolean {
  const slots = sortedSlots(detail)

  return slots.length > 0 && slots.every(isSigned)
}

// The dashboard badge for an envelope the user OWNS, derived from the list projection
// (status + slot/signed counts + whose-turn). Terminal states win; then the owner's own
// turn to sign; then progress while waiting on other signers. The view maps labelKey to
// i18n (the `progress` label uses the signed/total params). Kept here, unit-tested, so the
// label logic isn't inlined in the view.
export interface OwnedBadge {
  tone: 'green' | 'amber' | 'red' | 'neutral'
  labelKey: string
  params?: { signed: number; total: number }
}

export function ownedEnvelopeBadge(e: EnvelopeSummary): OwnedBadge {
  const signed = e.signedCount ?? 0
  const total = e.slotCount ?? 0
  if (/completed|signed/i.test(e.status)) return { tone: 'green', labelKey: 'envelopes.badge.completed' }
  if (/cancelled|declined/i.test(e.status)) return { tone: 'red', labelKey: 'envelopes.badge.declined' }
  if (/draft/i.test(e.status)) return { tone: 'neutral', labelKey: 'envelopes.badge.draft' }
  if (e.yourTurn) return { tone: 'green', labelKey: 'envelopes.badge.yourTurn' }
  // Actionable but not the owner's turn — waiting on other signers. Show progress once
  // anything is signed, otherwise a plain "waiting".
  if (signed > 0) return { tone: 'amber', labelKey: 'envelopes.badge.progress', params: { signed, total } }

  return { tone: 'amber', labelKey: 'envelopes.badge.waiting', params: { signed, total } }
}
