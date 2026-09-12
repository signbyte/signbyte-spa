// The way back to the system that prepared a signing — the envelope's origin — built
// from the composed envelope view. The portal knows the envelope, not the requester's
// own record: the stored return address carries what the requester put there (its own
// state), and the portal adds what only it knows for certain — which signing request
// (the envelope id it is showing), which slot returned and what the person did. It never
// invents a destination: a return address is used exactly as stored, https only, or there
// is no way back.
import type { ComposedSlot, EnvelopeDetail } from '@/stores/envelopes'
import { isDeclined, isSigned } from './envelope-status'

// What the person did — their own act, never the envelope's state. A two-signer
// envelope is still in progress after the first signer returns as `signed`.
export type ReturnOutcome = 'signed' | 'declined' | 'cancelled'

export interface ReturnTarget {
  // The requester's registered display name — the button reads "Return to <name>".
  name: string
  // The full address the browser goes to: signingRequest + slot + outcome appended.
  href: string
}

// The person's act on this envelope, or null while their part is not over: their slot
// signed or declined, else the envelope cancelled under them. The act wins over the
// envelope's state — a signer who signed before a cancel still returns as `signed`;
// the requester reads the request's own state on its side.
export function returnOutcome(
  detail: EnvelopeDetail | null,
  slot: ComposedSlot | null | undefined,
): ReturnOutcome | null {
  if (!detail) return null
  if (slot && isSigned(slot)) return 'signed'
  if (slot && isDeclined(slot)) return 'declined'
  if (/cancelled/i.test(detail.envelope.status)) return 'cancelled'

  return null
}

// The return target for one slot and outcome, or null when the envelope has no origin,
// this signer has no return address of their own, or the address is not https. A return
// belongs to one signer: the requester gives it to the people it wants back (its own),
// and leaves it off an external party — who then sees no way back and is never sent to,
// or shown, the requester's system. No address, no button; nothing is inherited from the
// envelope. Whatever query the stored address already carries is kept; the three
// parameters the portal owns are set by it, so a stale value in the stored address never
// wins over what is actually being shown.
export function returnTarget(
  detail: EnvelopeDetail | null,
  slot: ComposedSlot | null | undefined,
  outcome: ReturnOutcome,
): ReturnTarget | null {
  if (!detail) return null
  const origin = detail.envelope.origin
  if (!origin?.name) return null
  const base = slot?.returnUrl
  if (!base) return null
  let url: URL
  try {
    url = new URL(base)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  url.searchParams.set('signingRequest', detail.envelope.id)
  if (slot) url.searchParams.set('slot', String(slot.orderIndex))
  url.searchParams.set('outcome', outcome)

  return { name: origin.name, href: url.toString() }
}
